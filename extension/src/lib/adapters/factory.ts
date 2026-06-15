/**
 * adapters/factory.ts — Adapter factory and settings helpers
 */

import type { StorageAdapter, AdapterCredentials, SyncSettings } from './interface';
import { DEFAULT_SETTINGS } from './interface';
import { WebDAVAdapter } from './webdav';
import { GitHubAdapter } from './github';

const SETTINGS_KEY = 'sf_sync_settings';

// ─── Factory ──────────────────────────────────────────────────────────

export function createAdapter(creds: AdapterCredentials): StorageAdapter {
  switch (creds.type) {
    case 'webdav':
      return new WebDAVAdapter(creds);
    case 'github':
      return new GitHubAdapter(creds);
    default:
      throw new Error(`Unknown adapter type: ${(creds as AdapterCredentials).type}`);
  }
}

// ─── Settings CRUD ────────────────────────────────────────────────────

export async function loadSettings(): Promise<SyncSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] ?? {}) };
}

export async function saveSettings(settings: Partial<SyncSettings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(SETTINGS_KEY);
}

/**
 * Returns a configured adapter or null if not set up.
 */
export async function getAdapter(): Promise<StorageAdapter | null> {
  const settings = await loadSettings();
  if (!settings.credentials) return null;
  try {
    return createAdapter(settings.credentials);
  } catch {
    return null;
  }
}
