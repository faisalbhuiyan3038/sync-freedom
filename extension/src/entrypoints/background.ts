/**
 * background.ts — Sync Freedom Service Worker
 *
 * Orchestrates all sync activity:
 * - Registers chrome.alarms for periodic sync
 * - Listens to tab events (debounced via alarm)
 * - Runs full sync cycle on each alarm
 * - Responds to popup messages
 */

import { getDeviceInfo } from '../lib/device';
import { loadSettings } from '../lib/adapters/factory';
import { createAdapter } from '../lib/adapters/factory';
import { deriveKey } from '../lib/crypto';
import { pushTabsIfChanged, pullRemoteTabs } from '../lib/sync/tabs';
import { registerHistoryListener, pushHistoryDelta, pullAndMergeHistory } from '../lib/sync/history';

// ─── Constants ────────────────────────────────────────────────────────

const ALARM_SYNC = 'sf_sync';
const ALARM_TAB_DEBOUNCE = 'sf_tab_debounce';
const STATUS_KEY = 'sf_sync_status';

// ─── Status tracking ──────────────────────────────────────────────────

export interface SyncStatus {
  lastSyncAt: number | null;
  lastSyncResult: 'success' | 'error' | 'idle';
  lastError: string | null;
  lastWarning?: string | null;
  isSyncing: boolean;
  tabsPushed: number;
  remoteDeviceCount: number;
}

async function setStatus(status: Partial<SyncStatus>): Promise<void> {
  const current = await getStatus();
  await chrome.storage.local.set({ [STATUS_KEY]: { ...current, ...status } });
}

async function getStatus(): Promise<SyncStatus> {
  const data = await chrome.storage.local.get(STATUS_KEY);
  return data[STATUS_KEY] ?? {
    lastSyncAt: null,
    lastSyncResult: 'idle',
    lastError: null,
    lastWarning: null,
    isSyncing: false,
    tabsPushed: 0,
    remoteDeviceCount: 0,
  };
}

// ─── Key cache ────────────────────────────────────────────────────────

// The derived CryptoKey cannot be stored in chrome.storage, so we cache it
// in memory for the lifetime of the service worker.
let _cachedKey: { key: CryptoKey; passphrase: string } | null = null;

async function getEncryptionKey(passphrase: string, salt: string): Promise<CryptoKey> {
  if (_cachedKey && _cachedKey.passphrase === passphrase) {
    return _cachedKey.key;
  }
  const { key } = await deriveKey(passphrase, salt);
  _cachedKey = { key, passphrase };
  return key;
}

// ─── Core sync cycle ──────────────────────────────────────────────────

async function runSyncCycle(): Promise<void> {
  const settings = await loadSettings();

  if (!settings.credentials) {
    console.log('[Sync] No credentials configured — skipping sync.');
    return;
  }

  if (!settings.encryptionSalt) {
    console.log('[Sync] No encryption salt — skipping sync.');
    return;
  }

  // Get passphrase from session storage (set during popup unlock)
  const session = await chrome.storage.session?.get('sf_passphrase').catch(() => ({})) ?? {};
  const passphrase = (session as Record<string, string>)['sf_passphrase'];

  if (!passphrase) {
    console.log('[Sync] No passphrase in session — skipping sync.');
    return;
  }

  await setStatus({ isSyncing: true });

  try {
    const adapter = createAdapter(settings.credentials);
    const key = await getEncryptionKey(passphrase, settings.encryptionSalt);
    const deviceInfo = await getDeviceInfo();

    // Check if manifest.json exists, if not write it (for backward compatibility/migration)
    const manifestPath = '/sync-freedom/manifest.json';
    let needsManifest = false;
    try {
      await adapter.getFile(manifestPath);
    } catch {
      needsManifest = true;
    }

    if (needsManifest && settings.encryptionSalt) {
      try {
        console.log('[Sync] Manifest not found on backend. Uploading existing salt to manifest.json...');
        const manifest = {
          salt: settings.encryptionSalt,
          version: 1,
          createdAt: Date.now(),
        };
        const bytes = new TextEncoder().encode(JSON.stringify(manifest));
        await adapter.putFile(manifestPath, bytes.buffer as ArrayBuffer);
        console.log('[Sync] Salt manifest successfully uploaded.');
      } catch (err) {
        console.warn('[Sync] Failed to upload salt manifest (non-fatal):', err);
      }
    }

    // ── Tab sync ──
    const { pushed, tabCount } = await pushTabsIfChanged(
      adapter,
      key,
      deviceInfo,
      settings.tabSnapshotCount,
    );

    const { devices: remoteTabs, errors: pullErrors } = await pullRemoteTabs(adapter, key, deviceInfo.deviceId);

    // ── History sync (Phase 2 — only if enabled) ──
    if (settings.historySyncEnabled) {
      await pushHistoryDelta(adapter, key, deviceInfo.deviceId);
      await pullAndMergeHistory(adapter, key, deviceInfo.deviceId);
    }

    const warningMsg = pullErrors.length > 0
      ? `Failed to decrypt data for ${pullErrors.length} device(s). Check passphrase compatibility.`
      : null;

    const decryptedTabs = remoteTabs.filter(d => !d.decryptionFailed);

    await setStatus({
      lastSyncAt: Date.now(),
      lastSyncResult: 'success',
      lastError: null,
      lastWarning: warningMsg,
      isSyncing: false,
      tabsPushed: pushed ? tabCount : 0,
      remoteDeviceCount: decryptedTabs.length,
    });

    console.log(`[Sync] ✓ Complete — tabs pushed: ${pushed}, remote devices: ${decryptedTabs.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync] ✗ Error:', message);
    await setStatus({
      lastSyncAt: Date.now(),
      lastSyncResult: 'error',
      lastError: message,
      lastWarning: null,
      isSyncing: false,
    });
  }
}

// ─── Alarm registration ───────────────────────────────────────────────

async function registerSyncAlarm(): Promise<void> {
  const settings = await loadSettings();
  const periodInMinutes = Math.max(1, settings.syncIntervalMinutes);

  const existing = await chrome.alarms.get(ALARM_SYNC);
  if (!existing) {
    chrome.alarms.create(ALARM_SYNC, {
      delayInMinutes: 1,
      periodInMinutes,
    });
    console.log(`[Sync] Alarm registered (every ${periodInMinutes} min)`);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────

export default defineBackground(() => {
  console.log('[Sync Freedom] Service worker starting...');

  // Register history listener immediately (builds queue even before Phase 2 activation)
  registerHistoryListener();

  // On install / update
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Sync Freedom] Installed/updated');
    await registerSyncAlarm();
  });

  // On alarm fire
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_SYNC) {
      await runSyncCycle();
    }
    if (alarm.name === ALARM_TAB_DEBOUNCE) {
      // Tab change debounce fired — run a lightweight tab-only push
      const settings = await loadSettings();
      const session = await chrome.storage.session?.get('sf_passphrase').catch(() => ({})) ?? {};
      const passphrase = (session as Record<string, string>)['sf_passphrase'];
      if (!settings.credentials || !settings.encryptionSalt || !passphrase) return;

      try {
        const adapter = createAdapter(settings.credentials);
        const key = await getEncryptionKey(passphrase, settings.encryptionSalt);
        const deviceInfo = await getDeviceInfo();
        await pushTabsIfChanged(adapter, key, deviceInfo, settings.tabSnapshotCount);
      } catch (err) {
        console.warn('[Sync] Tab debounce push failed:', err);
      }
    }
  });

  // Tab events → debounce via alarm
  const scheduleTabDebounce = (): void => {
    chrome.alarms.clear(ALARM_TAB_DEBOUNCE, () => {
      chrome.alarms.create(ALARM_TAB_DEBOUNCE, { delayInMinutes: 1 });
    });
  };

  chrome.tabs.onCreated.addListener(scheduleTabDebounce);
  chrome.tabs.onRemoved.addListener(scheduleTabDebounce);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    // Only trigger on URL or title changes
    if (changeInfo.url || changeInfo.title) {
      scheduleTabDebounce();
    }
  });

  // Message handler for popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type: string; payload?: unknown };

    if (msg.type === 'SYNC_NOW') {
      runSyncCycle()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: String(err) }));
      return true; // async sendResponse
    }

    if (msg.type === 'GET_STATUS') {
      getStatus()
        .then(status => sendResponse({ status }))
        .catch(() => sendResponse({ status: null }));
      return true;
    }

    if (msg.type === 'SET_PASSPHRASE') {
      const { passphrase } = msg.payload as { passphrase: string };
      // Store in session storage (cleared when browser closes)
      chrome.storage.session?.set({ sf_passphrase: passphrase })
        .then(() => {
          _cachedKey = null; // Invalidate cached key
          sendResponse({ success: true });
        })
        .catch(() => {
          // chrome.storage.session not available (older browsers)
          // Fall back to in-memory only
          sendResponse({ success: true });
        });
      return true;
    }

    if (msg.type === 'TEST_CONNECTION') {
      const { credentials } = msg.payload as { credentials: Parameters<typeof createAdapter>[0] };
      const adapter = createAdapter(credentials);
      adapter.testConnection()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: String(err) }));
      return true;
    }

    if (msg.type === 'REGISTER_ALARM') {
      registerSyncAlarm()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    if (msg.type === 'DELETE_REMOTE_FILE') {
      const { filePath } = msg.payload as { filePath: string };
      loadSettings().then(settings => {
        if (settings.credentials) {
          const adapter = createAdapter(settings.credentials);
          adapter.deleteFile(filePath)
            .then(() => runSyncCycle())
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: String(err) }));
        } else {
          sendResponse({ success: false, error: 'No storage credentials found' });
        }
      }).catch(err => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }
  });

  // Ensure alarm is registered on every SW restart
  registerSyncAlarm();
});
