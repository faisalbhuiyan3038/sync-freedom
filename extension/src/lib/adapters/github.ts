/**
 * adapters/github.ts — GitHub repository storage adapter
 *
 * Uses the GitHub REST API v3 (Contents API) to store files in a private repo.
 * Auth: Personal Access Token (PAT) with "Contents: read+write" permission.
 *
 * File layout in the repo:
 *   /sync-freedom/tabs/{deviceId}.json.enc
 *   /sync-freedom/history/deltas/{ts}_{deviceId}.json.enc
 *   /sync-freedom/history/snapshot.json.enc
 */

import type { StorageAdapter, GitHubCredentials } from './interface';
import { bufferToBase64, base64ToBuffer } from '../crypto';

const API_BASE = 'https://api.github.com';

interface GitHubFileResponse {
  sha: string;
  content: string; // base64-encoded
  encoding: string;
}

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
}

export class GitHubAdapter implements StorageAdapter {
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly creds: GitHubCredentials) {
    this.owner = creds.owner;
    this.repo = creds.repo;
    this.branch = creds.branch || 'main';
    this.headers = {
      Authorization: `Bearer ${creds.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async testConnection(): Promise<void> {
    const resp = await fetch(`${API_BASE}/repos/${this.owner}/${this.repo}`, {
      headers: this.headers,
    });
    if (resp.status === 401) throw new Error('GitHub: Invalid token. Check your Personal Access Token.');
    if (resp.status === 404) throw new Error(`GitHub: Repository "${this.owner}/${this.repo}" not found. Make sure it exists and the token has access.`);
    if (!resp.ok) throw new Error(`GitHub: Server returned ${resp.status}`);
  }

  async putFile(path: string, data: ArrayBuffer): Promise<void> {
    const content = bufferToBase64(new Uint8Array(data));
    const normalizedPath = this.normalizePath(path);

    // Get existing SHA if file exists (needed for updates)
    const existingSha = await this.getFileSha(normalizedPath);

    const body: Record<string, unknown> = {
      message: `sync: update ${normalizedPath.split('/').pop()}`,
      content,
      branch: this.branch,
    };
    if (existingSha) body.sha = existingSha;

    const resp = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}/contents/${normalizedPath}`,
      { method: 'PUT', headers: this.headers, body: JSON.stringify(body) },
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { message?: string };
      throw new Error(`GitHub PUT failed: ${resp.status} — ${err.message ?? 'unknown error'}`);
    }
  }

  async getFile(path: string): Promise<ArrayBuffer> {
    const normalizedPath = this.normalizePath(path);
    const resp = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}/contents/${normalizedPath}?ref=${this.branch}`,
      { headers: this.headers },
    );
    if (resp.status === 404) throw new Error(`GitHub: File not found: ${path}`);
    if (!resp.ok) throw new Error(`GitHub GET failed: ${resp.status} — ${path}`);

    const json = await resp.json() as GitHubFileResponse;
    // GitHub returns base64 with newlines — strip them
    const cleanBase64 = json.content.replace(/\n/g, '');
    return base64ToBuffer(cleanBase64).buffer as ArrayBuffer;
  }

  async listFiles(prefix: string): Promise<string[]> {
    const normalizedPrefix = this.normalizePath(prefix);
    // Use the Git Trees API with recursive=1 for efficient listing
    const resp = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`,
      { headers: this.headers },
    );
    if (resp.status === 404) return []; // Repo is empty or branch doesn't exist yet
    if (!resp.ok) throw new Error(`GitHub: Failed to list files: ${resp.status}`);

    const json = await resp.json() as { tree: GitHubTreeItem[]; truncated: boolean };
    return json.tree
      .filter(item => item.type === 'blob' && item.path.startsWith(normalizedPrefix))
      .map(item => '/' + item.path);
  }

  async deleteFile(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const sha = await this.getFileSha(normalizedPath);
    if (!sha) return; // Already gone

    const resp = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}/contents/${normalizedPath}`,
      {
        method: 'DELETE',
        headers: this.headers,
        body: JSON.stringify({
          message: `sync: delete ${normalizedPath.split('/').pop()}`,
          sha,
          branch: this.branch,
        }),
      },
    );
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`GitHub DELETE failed: ${resp.status} — ${path}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // Strip leading slash — GitHub API paths must not start with /
    return path.replace(/^\//, '');
  }

  private async getFileSha(path: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `${API_BASE}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
        { headers: this.headers },
      );
      if (!resp.ok) return null;
      const json = await resp.json() as { sha?: string };
      return json.sha ?? null;
    } catch {
      return null;
    }
  }
}
