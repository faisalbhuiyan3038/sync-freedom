/**
 * sync/history.ts — History synchronization (Phase 2)
 *
 * Scaffolded for Phase 2. Listeners are registered in Phase 1 to begin
 * building the queue. Delta push/pull is activated when historySyncEnabled = true.
 *
 * Strategy:
 * - Capture: chrome.history.onVisited → enqueue to IndexedDB
 * - Push: bundle unsynced queue items → encrypt → upload as delta file
 * - Pull: fetch deltas from other devices since cursor → merge by timestamp union
 * - Apply: chrome.history.addUrl() for remote visits not in local history
 */

import type { StorageAdapter } from '../adapters/interface';
import { encryptString, decryptString, serializeBlob, deserializeBlob } from '../crypto';
import {
  enqueueVisit,
  getUnsynced,
  markSynced,
  pruneOldSynced,
  getCursor,
  setCursor,
} from '../db';

const HISTORY_DELTAS_PREFIX = '/sync-freedom/history/deltas';
const PRUNE_OLDER_THAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Map of url -> timestamp (ms) when it was programmatically added
const programmaticallyAddedUrls = new Map<string, number>();

// ─── Types ────────────────────────────────────────────────────────────

export interface HistoryDelta {
  deviceId: string;
  pushedAt: number;
  visits: Array<{
    url: string;
    title: string;
    visitTime: number;
  }>;
}

// ─── Capture ──────────────────────────────────────────────────────────

/**
 * Register the onVisited listener. Call once from background.ts.
 * Always registers — even before Phase 2 activation — so queue builds up.
 */
export function registerHistoryListener(): void {
  if (!chrome.history?.onVisited) return; // Guard for browsers without history API

  chrome.history.onVisited.addListener(async (item) => {
    if (!item.url) return;

    // Skip programmatically added visits to prevent infinite loop
    const addedTime = programmaticallyAddedUrls.get(item.url);
    if (addedTime && Date.now() - addedTime < 10000) {
      programmaticallyAddedUrls.delete(item.url);
      return;
    }

    try {
      await enqueueVisit({
        url: item.url,
        title: item.title ?? item.url,
        visitTime: item.lastVisitTime ?? Date.now(),
      });
    } catch (err) {
      console.warn('[History] Failed to enqueue visit:', err);
    }
  });
}

// ─── Push ─────────────────────────────────────────────────────────────

/**
 * Bundle and push unsynced history visits as an encrypted delta file.
 * @returns Number of visits pushed.
 */
export async function pushHistoryDelta(
  adapter: StorageAdapter,
  encryptionKey: CryptoKey,
  deviceId: string,
): Promise<number> {
  const unsynced = await getUnsynced();
  if (unsynced.length === 0) return 0;

  const delta: HistoryDelta = {
    deviceId,
    pushedAt: Date.now(),
    visits: unsynced.map(item => ({
      url: item.url,
      title: item.title,
      visitTime: item.visitTime,
    })),
  };

  const blob = await encryptString(encryptionKey, JSON.stringify(delta));
  const serialized = new TextEncoder().encode(serializeBlob(blob));
  const filename = `${delta.pushedAt}_${deviceId}.json.enc`;
  const path = `${HISTORY_DELTAS_PREFIX}/${filename}`;

  await adapter.putFile(path, serialized.buffer as ArrayBuffer);

  // Mark as synced
  const ids = unsynced.map(item => item.id!).filter(Boolean);
  await markSynced(ids);

  // Prune old synced items
  await pruneOldSynced(PRUNE_OLDER_THAN_MS);

  return unsynced.length;
}

// ─── Pull & merge ─────────────────────────────────────────────────────

/**
 * Pull new deltas from all remote devices and apply them to local history.
 * @returns Number of visits applied.
 */
export async function pullAndMergeHistory(
  adapter: StorageAdapter,
  encryptionKey: CryptoKey,
  myDeviceId: string,
): Promise<number> {
  const allFiles = await adapter.listFiles(HISTORY_DELTAS_PREFIX + '/');

  // Filter to files from other devices
  const remoteFiles = allFiles.filter(f => !f.includes(myDeviceId));

  let totalApplied = 0;

  for (const filePath of remoteFiles) {
    // Extract deviceId from filename: {timestamp}_{deviceId}.json.enc
    const filename = filePath.split('/').pop() ?? '';
    const parts = filename.replace('.json.enc', '').split('_');
    const fileTs = parseInt(parts[0], 10);
    const fileDeviceId = parts.slice(1).join('_');

    if (!fileDeviceId || isNaN(fileTs)) continue;

    // Check cursor — skip if we've already processed this file
    const cursor = await getCursor(fileDeviceId);
    if (cursor && cursor.lastPulledAt >= fileTs) continue;

    try {
      const raw = await adapter.getFile(filePath);
      const text = new TextDecoder().decode(raw);
      const blob = deserializeBlob(text);
      const decrypted = await decryptString(encryptionKey, blob);
      const delta = JSON.parse(decrypted) as HistoryDelta;

      // Apply visits to local history
      const applied = await applyDelta(delta);
      totalApplied += applied;

      // Update cursor for this device
      await setCursor({ deviceId: fileDeviceId, lastPulledAt: fileTs });
    } catch (err) {
      console.warn(`[History] Failed to process delta ${filePath}:`, err);
    }
  }

  return totalApplied;
}

async function applyDelta(delta: HistoryDelta): Promise<number> {
  let applied = 0;

  for (const visit of delta.visits) {
    try {
      // Register this URL in our ignore list before adding it
      programmaticallyAddedUrls.set(visit.url, Date.now());
      await chrome.history.addUrl({ url: visit.url });
      applied++;
    } catch (err) {
      programmaticallyAddedUrls.delete(visit.url);
      // Some URLs may be rejected (e.g., non-http) — ignore silently
    }
  }

  return applied;
}
