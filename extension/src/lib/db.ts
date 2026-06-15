/**
 * db.ts — IndexedDB wrapper for the history visit queue and sync cursors
 *
 * Provides a simple async API over IndexedDB. Used by the history sync module
 * to queue local visits before they are bundled into encrypted delta files.
 */

const DB_NAME = 'sync_freedom';
const DB_VERSION = 2;

export interface HistoryQueueItem {
  id?: number;       // auto-incremented
  url: string;
  title: string;
  visitTime: number; // Unix ms
  synced: number;    // 0 = unsynced, 1 = synced
}

export interface SyncCursor {
  deviceId: string;
  lastPulledAt: number; // Unix ms timestamp of the newest delta we have pulled
}

// ─── DB init ──────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(new Error(`IDB open failed: ${req.error}`));

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Drop old stores if upgrading
      if (db.objectStoreNames.contains('history_queue')) {
        db.deleteObjectStore('history_queue');
      }
      if (db.objectStoreNames.contains('sync_cursors')) {
        db.deleteObjectStore('sync_cursors');
      }

      // Recreate history queue store
      const store = db.createObjectStore('history_queue', {
        keyPath: 'id',
        autoIncrement: true,
      });
      store.createIndex('by_synced', 'synced', { unique: false });
      store.createIndex('by_visitTime', 'visitTime', { unique: false });

      // Recreate sync cursors store (one entry per remote device)
      db.createObjectStore('sync_cursors', { keyPath: 'deviceId' });
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
  });
}

// ─── History queue ────────────────────────────────────────────────────

export async function enqueueVisit(item: Omit<HistoryQueueItem, 'id' | 'synced'>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_queue', 'readwrite');
    tx.objectStore('history_queue').add({ ...item, synced: 0 });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUnsynced(): Promise<HistoryQueueItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_queue', 'readonly');
    const index = tx.objectStore('history_queue').index('by_synced');
    const req = index.getAll(IDBKeyRange.only(0));
    req.onsuccess = () => resolve(req.result as HistoryQueueItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_queue', 'readwrite');
    const store = tx.objectStore('history_queue');
    let pending = ids.length;
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result as HistoryQueueItem;
        if (item) {
          item.synced = 1;
          store.put(item);
        }
        if (--pending === 0) { /* wait for oncomplete */ }
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pruneOldSynced(olderThanMs: number): Promise<void> {
  const db = await getDB();
  const cutoff = Date.now() - olderThanMs;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_queue', 'readwrite');
    const index = tx.objectStore('history_queue').index('by_visitTime');
    const range = IDBKeyRange.upperBound(cutoff);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const item = cursor.value as HistoryQueueItem;
        if (item.synced === 1) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Sync cursors ─────────────────────────────────────────────────────

export async function getCursor(deviceId: string): Promise<SyncCursor | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_cursors', 'readonly');
    const req = tx.objectStore('sync_cursors').get(deviceId);
    req.onsuccess = () => resolve((req.result as SyncCursor) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setCursor(cursor: SyncCursor): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_cursors', 'readwrite');
    tx.objectStore('sync_cursors').put(cursor);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
