/**
 * sync/tabs.ts — Tab synchronization logic
 *
 * Handles:
 * - Capturing current open tabs
 * - Pushing encrypted tab list to storage backend
 * - Maintaining a local ring buffer of the last N tab state snapshots
 * - Pulling other devices' tab lists from storage
 */

import type { StorageAdapter } from '../adapters/interface';
import type { DeviceInfo } from '../device';
import { encryptString, decryptString, serializeBlob, deserializeBlob } from '../crypto';
import { isInternalUrl } from '../../utils/favicon';

// ─── Types ────────────────────────────────────────────────────────────

export interface TabEntry {
  url: string;
  title: string;
  favIconUrl?: string;
  pinned?: boolean;
}

/** A single device's tab state at a point in time */
export interface DeviceTabList {
  deviceId: string;
  deviceName: string;
  lastUpdated: number; // Unix ms
  tabs: TabEntry[];
  decryptionFailed?: boolean;
  filePath?: string;
}

/** A historical snapshot of this device's tabs */
export interface TabSnapshot {
  timestamp: number; // Unix ms
  tabs: TabEntry[];
}

const TABS_PREFIX = '/sync-freedom/tabs';
const LOCAL_SNAPSHOTS_KEY = 'sf_tab_snapshots';
const REMOTE_CACHE_KEY = 'sf_remote_tabs';
const LAST_PUSHED_KEY = 'sf_last_pushed_tabs';

// ─── Capture ──────────────────────────────────────────────────────────

/**
 * Capture all current open tabs (excluding internal/extension URLs).
 */
export async function captureCurrentTabs(): Promise<TabEntry[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter(t => t.url && !isInternalUrl(t.url))
    .map(t => ({
      url: t.url!,
      title: t.title ?? t.url!,
      favIconUrl: t.favIconUrl,
      pinned: t.pinned,
    }));
}

// ─── Push ─────────────────────────────────────────────────────────────

/**
 * Push the current device's tab list to the storage backend if tabs have changed.
 * Also rotates the local snapshot ring buffer.
 */
export async function pushTabsIfChanged(
  adapter: StorageAdapter,
  encryptionKey: CryptoKey,
  deviceInfo: DeviceInfo,
  maxSnapshots: number = 4,
): Promise<{ pushed: boolean; tabCount: number }> {
  const currentTabs = await captureCurrentTabs();

  // Check if tabs changed since last push
  const lastPushed = await getLastPushedTabs();
  if (lastPushed && tabsEqual(currentTabs, lastPushed)) {
    return { pushed: false, tabCount: currentTabs.length };
  }

  // Build payload
  const payload: DeviceTabList = {
    deviceId: deviceInfo.deviceId,
    deviceName: deviceInfo.deviceName,
    lastUpdated: Date.now(),
    tabs: currentTabs,
  };

  // Encrypt and upload
  const blob = await encryptString(encryptionKey, JSON.stringify(payload));
  const serialized = new TextEncoder().encode(serializeBlob(blob));
  const path = `${TABS_PREFIX}/${deviceInfo.deviceId}.json.enc`;
  await adapter.putFile(path, serialized.buffer as ArrayBuffer);

  // Save last pushed state
  await chrome.storage.local.set({ [LAST_PUSHED_KEY]: currentTabs });

  // Rotate snapshot ring buffer
  await rotateSnapshot(currentTabs, maxSnapshots);

  return { pushed: true, tabCount: currentTabs.length };
}

// ─── Pull ─────────────────────────────────────────────────────────────

export interface PullRemoteTabsResult {
  devices: DeviceTabList[];
  errors: string[];
}

/**
 * Pull all other devices' tab lists from storage and cache them locally.
 * Returns the full list including all remote devices and a list of paths that failed to load/decrypt.
 */
export async function pullRemoteTabs(
  adapter: StorageAdapter,
  encryptionKey: CryptoKey,
  myDeviceId: string,
): Promise<PullRemoteTabsResult> {
  const files = await adapter.listFiles(TABS_PREFIX + '/');
  const remoteDeviceLists: DeviceTabList[] = [];
  const errors: string[] = [];

  await Promise.allSettled(
    files
      .filter(f => !f.includes(myDeviceId)) // skip own device
      .map(async (filePath) => {
        try {
          const raw = await adapter.getFile(filePath);
          const text = new TextDecoder().decode(raw);
          const blob = deserializeBlob(text);
          const decrypted = await decryptString(encryptionKey, blob);
          const deviceList = JSON.parse(decrypted) as DeviceTabList;
          remoteDeviceLists.push(deviceList);
        } catch (err) {
          console.warn(`[Tabs] Failed to pull/decrypt ${filePath}:`, err);
          errors.push(filePath);
          
          // Extract device ID from file path
          const match = filePath.match(/\/tabs\/(.+)\.json\.enc$/);
          const deviceId = match ? match[1] : filePath;
          
          remoteDeviceLists.push({
            deviceId,
            deviceName: `Unknown Device (${deviceId.slice(0, 8)})`,
            lastUpdated: 0,
            tabs: [],
            decryptionFailed: true,
            filePath,
          });
        }
      }),
  );

  // Sort by most recently updated
  remoteDeviceLists.sort((a, b) => b.lastUpdated - a.lastUpdated);

  // Cache for popup
  await chrome.storage.local.set({ [REMOTE_CACHE_KEY]: remoteDeviceLists });

  return { devices: remoteDeviceLists, errors };
}

/**
 * Get cached remote tabs from last pull (for instant popup load).
 */
export async function getCachedRemoteTabs(): Promise<DeviceTabList[]> {
  const data = await chrome.storage.local.get(REMOTE_CACHE_KEY);
  return (data[REMOTE_CACHE_KEY] as DeviceTabList[]) ?? [];
}

// ─── Snapshots ────────────────────────────────────────────────────────

/**
 * Get the local tab snapshot ring buffer (this device's history).
 */
export async function getTabSnapshots(): Promise<TabSnapshot[]> {
  const data = await chrome.storage.local.get(LOCAL_SNAPSHOTS_KEY);
  return (data[LOCAL_SNAPSHOTS_KEY] as TabSnapshot[]) ?? [];
}

async function rotateSnapshot(tabs: TabEntry[], maxSnapshots: number): Promise<void> {
  const snapshots = await getTabSnapshots();
  snapshots.push({ timestamp: Date.now(), tabs });

  // Keep only the last N snapshots
  const trimmed = snapshots.slice(-maxSnapshots);
  await chrome.storage.local.set({ [LOCAL_SNAPSHOTS_KEY]: trimmed });
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function getLastPushedTabs(): Promise<TabEntry[] | null> {
  const data = await chrome.storage.local.get(LAST_PUSHED_KEY);
  return (data[LAST_PUSHED_KEY] as TabEntry[]) ?? null;
}

function tabsEqual(a: TabEntry[], b: TabEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tab, i) => tab.url === b[i].url && tab.title === b[i].title);
}
