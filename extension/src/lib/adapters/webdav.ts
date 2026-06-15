/**
 * adapters/webdav.ts — WebDAV storage adapter
 *
 * Compatible with: Nextcloud, pCloud, Koofr, Synology NAS, any WebDAV server.
 * Uses Basic Auth (URL + username + password).
 *
 * File operations use standard HTTP: PUT, GET, MKCOL, PROPFIND, DELETE.
 */

import type { StorageAdapter, WebDAVCredentials } from './interface';

export class WebDAVAdapter implements StorageAdapter {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly creds: WebDAVCredentials) {
    // Normalize: strip trailing slash from URL
    this.baseUrl = creds.url.replace(/\/$/, '');
    this.authHeader = 'Basic ' + btoa(`${creds.username}:${creds.password}`);
  }

  async testConnection(): Promise<void> {
    const resp = await this.request('PROPFIND', '/', undefined, {
      Depth: '0',
      'Content-Type': 'application/xml',
    });
    if (resp.status === 401) throw new Error('WebDAV: Unauthorized. Check username and password.');
    if (resp.status === 404) throw new Error('WebDAV: URL not found. Check the server URL.');
    if (!resp.ok && resp.status !== 207) {
      throw new Error(`WebDAV: Server returned ${resp.status} ${resp.statusText}`);
    }
  }

  async putFile(path: string, data: ArrayBuffer): Promise<void> {
    // Ensure parent directory exists
    await this.ensureDir(this.dirOf(path));

    const resp = await this.request('PUT', path, data);
    if (!resp.ok) {
      throw new Error(`WebDAV PUT failed: ${resp.status} ${resp.statusText} — ${path}`);
    }
  }

  async getFile(path: string): Promise<ArrayBuffer> {
    const resp = await this.request('GET', path);
    if (resp.status === 404) throw new Error(`WebDAV: File not found: ${path}`);
    if (!resp.ok) throw new Error(`WebDAV GET failed: ${resp.status} — ${path}`);
    return resp.arrayBuffer();
  }

  async listFiles(prefix: string): Promise<string[]> {
    // Ensure prefix ends with /
    const dir = prefix.endsWith('/') ? prefix : prefix + '/';

    const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`;
    const resp = await this.request('PROPFIND', dir, new TextEncoder().encode(body), {
      Depth: '1',
      'Content-Type': 'application/xml',
    });

    if (resp.status === 404) return []; // Directory doesn't exist yet
    if (!resp.ok && resp.status !== 207) {
      throw new Error(`WebDAV PROPFIND failed: ${resp.status} — ${dir}`);
    }

    const xml = await resp.text();
    return this.parseHrefs(xml, dir);
  }

  async deleteFile(path: string): Promise<void> {
    const resp = await this.request('DELETE', path);
    if (resp.status === 404) return; // Already gone — fine
    if (!resp.ok) throw new Error(`WebDAV DELETE failed: ${resp.status} — ${path}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private async ensureDir(dir: string): Promise<void> {
    // Walk up and create directories bottom-up
    const parts = dir.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const resp = await this.request('MKCOL', current + '/');
      // 201 = created, 405 = already exists — both are fine
      if (resp.status !== 201 && resp.status !== 405 && !resp.ok) {
        // Not fatal — PUT will fail with a clear error if it matters
      }
    }
  }

  private dirOf(path: string): string {
    return path.substring(0, path.lastIndexOf('/'));
  }

  private buildUrl(path: string): string {
    // path should start with /sync-freedom/...
    const normalized = path.startsWith('/') ? path : '/' + path;
    return this.baseUrl + normalized;
  }

  private async request(
    method: string,
    path: string,
    body?: BodyInit,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    return fetch(this.buildUrl(path), {
      method,
      headers: {
        Authorization: this.authHeader,
        ...extraHeaders,
      },
      body,
    });
  }

  /**
   * Parse WebDAV PROPFIND XML response and extract file hrefs (non-collection).
   */
  private parseHrefs(xml: string, prefix: string): string[] {
    const hrefs: string[] = [];
    // Match <d:href>...</d:href> elements
    const hrefRegex = /<(?:[^:]+:)?href[^>]*>([^<]+)<\/(?:[^:]+:)?href>/gi;
    let match: RegExpExecArray | null;

    // Decode base URL path to compare
    const baseUrlPath = new URL(this.baseUrl).pathname;

    while ((match = hrefRegex.exec(xml)) !== null) {
      let href = decodeURIComponent(match[1].trim());
      // Convert absolute path to relative (strip server base path)
      if (href.startsWith(baseUrlPath)) {
        href = href.slice(baseUrlPath.length);
      }
      // Skip the directory itself and directories
      const isDir = href.endsWith('/');
      if (!isDir && href.includes(prefix.replace(/\/$/, ''))) {
        hrefs.push(href);
      }
    }

    return hrefs;
  }
}
