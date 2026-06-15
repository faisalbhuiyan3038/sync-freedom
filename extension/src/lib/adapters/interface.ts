/**
 * adapters/interface.ts — StorageAdapter contract
 *
 * All storage backends implement this interface. Encryption is handled
 * by the caller — adapters deal exclusively in raw bytes (ArrayBuffer).
 */

export interface StorageAdapter {
  /** Validate credentials and test connectivity. Throws on failure with a user-readable message. */
  testConnection(): Promise<void>;

  /**
   * Upload a file. Creates parent directories if the backend supports it.
   * @param path  Forward-slash path, e.g. "/sync-freedom/tabs/device_abc.json.enc"
   * @param data  Raw bytes to upload
   */
  putFile(path: string, data: ArrayBuffer): Promise<void>;

  /**
   * Download a file.
   * @param path  Forward-slash path
   * @returns     Raw bytes
   * @throws      If the file does not exist
   */
  getFile(path: string): Promise<ArrayBuffer>;

  /**
   * List files under a path prefix.
   * @param prefix  Path prefix, e.g. "/sync-freedom/history/deltas/"
   * @returns       Array of full file paths matching the prefix
   */
  listFiles(prefix: string): Promise<string[]>;

  /**
   * Delete a file. Does not throw if the file doesn't exist.
   */
  deleteFile(path: string): Promise<void>;
}

// ─── Credential types (stored in chrome.storage.local) ───────────────

export type BackendType = 'webdav' | 'github' | 'none';

export interface WebDAVCredentials {
  type: 'webdav';
  url: string;       // e.g. "https://my.nextcloud.com/remote.php/dav/files/user/"
  username: string;
  password: string;
}

export interface GitHubCredentials {
  type: 'github';
  token: string;    // Personal Access Token
  owner: string;    // GitHub username or org
  repo: string;     // Repository name
  branch: string;   // Default: "main"
}

export type AdapterCredentials = WebDAVCredentials | GitHubCredentials;

// ─── Settings shape stored in chrome.storage.local ───────────────────

export interface SyncSettings {
  credentials: AdapterCredentials | null;
  /** base64-encoded PBKDF2 salt derived at setup time */
  encryptionSalt: string | null;
  /** Number of tab snapshots to retain (2–10) */
  tabSnapshotCount: number;
  /** Whether history sync is enabled (Phase 2) */
  historySyncEnabled: boolean;
  /** How often to sync in minutes (minimum 1 for MV3 alarms) */
  syncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: SyncSettings = {
  credentials: null,
  encryptionSalt: null,
  tabSnapshotCount: 4,
  historySyncEnabled: false,
  syncIntervalMinutes: 5,
};
