/**
 * Sync Freedom — API Probe: Background Service Worker
 *
 * Systematically tests every Chrome extension API that the sync extension
 * will depend on. Results are persisted to chrome.storage.local for the
 * popup to display.
 */

// ─── Helpers ──────────────────────────────────────────────────────────

function result(api, method, status, detail = '') {
  return { api, method, status, detail, timestamp: Date.now() };
}

async function probe(api, method, fn) {
  try {
    const detail = await fn();
    return result(api, method, 'pass', detail ?? '');
  } catch (err) {
    return result(api, method, 'fail', String(err?.message ?? err));
  }
}

// ─── Probes ───────────────────────────────────────────────────────────

async function probeChromeTabs() {
  const results = [];

  // chrome.tabs exists?
  results.push(await probe('chrome.tabs', 'API exists', () => {
    if (!chrome?.tabs) throw new Error('chrome.tabs is undefined');
    return 'chrome.tabs namespace available';
  }));

  // query
  results.push(await probe('chrome.tabs', 'query()', async () => {
    const tabs = await chrome.tabs.query({});
    return `Returned ${tabs.length} tab(s)`;
  }));

  // get (first tab)
  results.push(await probe('chrome.tabs', 'get()', async () => {
    const tabs = await chrome.tabs.query({});
    if (tabs.length === 0) throw new Error('No tabs to get');
    const tab = await chrome.tabs.get(tabs[0].id);
    return `Got tab id=${tab.id}, url=${(tab.url ?? '').slice(0, 60)}`;
  }));

  // create + remove (round-trip)
  results.push(await probe('chrome.tabs', 'create() + remove()', async () => {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    await chrome.tabs.remove(tab.id);
    return `Created and removed tab id=${tab.id}`;
  }));

  // onCreated listener registration
  results.push(await probe('chrome.tabs', 'onCreated listener', () => {
    if (!chrome.tabs.onCreated?.addListener) throw new Error('onCreated.addListener missing');
    return 'Listener API available';
  }));

  // onUpdated listener registration
  results.push(await probe('chrome.tabs', 'onUpdated listener', () => {
    if (!chrome.tabs.onUpdated?.addListener) throw new Error('onUpdated.addListener missing');
    return 'Listener API available';
  }));

  // onRemoved listener registration
  results.push(await probe('chrome.tabs', 'onRemoved listener', () => {
    if (!chrome.tabs.onRemoved?.addListener) throw new Error('onRemoved.addListener missing');
    return 'Listener API available';
  }));

  return results;
}

async function probeChromeHistory() {
  const results = [];

  results.push(await probe('chrome.history', 'API exists', () => {
    if (!chrome?.history) throw new Error('chrome.history is undefined');
    return 'chrome.history namespace available';
  }));

  // search
  results.push(await probe('chrome.history', 'search()', async () => {
    const items = await chrome.history.search({ text: '', maxResults: 5 });
    return `Returned ${items.length} item(s)`;
  }));

  // addUrl
  const testUrl = 'https://sync-freedom-api-probe.test/probe-' + Date.now();
  results.push(await probe('chrome.history', 'addUrl()', async () => {
    await chrome.history.addUrl({ url: testUrl });
    return `Added ${testUrl}`;
  }));

  // getVisits
  results.push(await probe('chrome.history', 'getVisits()', async () => {
    const visits = await chrome.history.getVisits({ url: testUrl });
    return `Got ${visits.length} visit(s) for probe URL`;
  }));

  // deleteUrl (clean up)
  results.push(await probe('chrome.history', 'deleteUrl()', async () => {
    await chrome.history.deleteUrl({ url: testUrl });
    return `Deleted probe URL`;
  }));

  // onVisited listener
  results.push(await probe('chrome.history', 'onVisited listener', () => {
    if (!chrome.history.onVisited?.addListener) throw new Error('onVisited.addListener missing');
    return 'Listener API available';
  }));

  return results;
}

async function probeChromeAlarms() {
  const results = [];

  results.push(await probe('chrome.alarms', 'API exists', () => {
    if (!chrome?.alarms) throw new Error('chrome.alarms is undefined');
    return 'chrome.alarms namespace available';
  }));

  const alarmName = 'sync-freedom-probe-' + Date.now();

  // create
  results.push(await probe('chrome.alarms', 'create()', async () => {
    await chrome.alarms.create(alarmName, { delayInMinutes: 1 });
    return `Created alarm "${alarmName}"`;
  }));

  // get
  results.push(await probe('chrome.alarms', 'get()', async () => {
    const alarm = await chrome.alarms.get(alarmName);
    if (!alarm) throw new Error('Alarm not found after create');
    return `Got alarm, scheduledTime=${alarm.scheduledTime}`;
  }));

  // getAll
  results.push(await probe('chrome.alarms', 'getAll()', async () => {
    const alarms = await chrome.alarms.getAll();
    return `Found ${alarms.length} alarm(s)`;
  }));

  // clear
  results.push(await probe('chrome.alarms', 'clear()', async () => {
    const cleared = await chrome.alarms.clear(alarmName);
    if (!cleared) throw new Error('clear() returned false');
    return 'Alarm cleared successfully';
  }));

  // onAlarm listener
  results.push(await probe('chrome.alarms', 'onAlarm listener', () => {
    if (!chrome.alarms.onAlarm?.addListener) throw new Error('onAlarm.addListener missing');
    return 'Listener API available';
  }));

  return results;
}

async function probeChromeStorage() {
  const results = [];

  results.push(await probe('chrome.storage', 'API exists', () => {
    if (!chrome?.storage) throw new Error('chrome.storage is undefined');
    return 'chrome.storage namespace available';
  }));

  const testKey = '_probe_test_' + Date.now();

  // local.set
  results.push(await probe('chrome.storage', 'local.set()', async () => {
    await chrome.storage.local.set({ [testKey]: { hello: 'world', ts: Date.now() } });
    return 'Set succeeded';
  }));

  // local.get
  results.push(await probe('chrome.storage', 'local.get()', async () => {
    const data = await chrome.storage.local.get(testKey);
    if (!data[testKey]) throw new Error('Key not found after set');
    return `Got value: ${JSON.stringify(data[testKey]).slice(0, 80)}`;
  }));

  // local.getBytesInUse
  results.push(await probe('chrome.storage', 'local.getBytesInUse()', async () => {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return `${bytes} bytes in use`;
  }));

  // local.remove
  results.push(await probe('chrome.storage', 'local.remove()', async () => {
    await chrome.storage.local.remove(testKey);
    return 'Remove succeeded';
  }));

  // sync area
  results.push(await probe('chrome.storage', 'sync.set()', async () => {
    if (!chrome.storage.sync) throw new Error('chrome.storage.sync is undefined');
    await chrome.storage.sync.set({ [testKey]: 'probe' });
    return 'sync.set succeeded';
  }));

  results.push(await probe('chrome.storage', 'sync.get()', async () => {
    if (!chrome.storage.sync) throw new Error('chrome.storage.sync is undefined');
    const data = await chrome.storage.sync.get(testKey);
    if (!data[testKey]) throw new Error('Key not found in sync');
    await chrome.storage.sync.remove(testKey); // cleanup
    return `sync.get succeeded, value="${data[testKey]}"`;
  }));

  return results;
}

async function probeChromeRuntime() {
  const results = [];

  results.push(await probe('chrome.runtime', 'API exists', () => {
    if (!chrome?.runtime) throw new Error('chrome.runtime is undefined');
    return 'chrome.runtime namespace available';
  }));

  results.push(await probe('chrome.runtime', 'getManifest()', () => {
    const m = chrome.runtime.getManifest();
    return `name="${m.name}", v=${m.version}, mv=${m.manifest_version}`;
  }));

  results.push(await probe('chrome.runtime', 'getPlatformInfo()', async () => {
    const info = await chrome.runtime.getPlatformInfo();
    return `os=${info.os}, arch=${info.arch}`;
  }));

  results.push(await probe('chrome.runtime', 'id', () => {
    if (!chrome.runtime.id) throw new Error('runtime.id is undefined');
    return `id=${chrome.runtime.id}`;
  }));

  // sendMessage (to self — will fail with no handler, but confirms API exists)
  results.push(await probe('chrome.runtime', 'sendMessage()', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'PROBE_PING' });
    } catch (e) {
      // "Could not establish connection" is expected — API still works
      if (e.message?.includes('Receiving end does not exist')) {
        return 'API works (no listener registered — expected)';
      }
      throw e;
    }
    return 'Message sent successfully';
  }));

  results.push(await probe('chrome.runtime', 'onMessage listener', () => {
    if (!chrome.runtime.onMessage?.addListener) throw new Error('onMessage.addListener missing');
    return 'Listener API available';
  }));

  return results;
}

async function probeServiceWorker() {
  const results = [];

  results.push(await probe('Service Worker', 'self.registration', () => {
    if (!self.registration) throw new Error('self.registration is undefined');
    return `scope=${self.registration.scope}`;
  }));

  results.push(await probe('Service Worker', 'self type', () => {
    const type = typeof ServiceWorkerGlobalScope !== 'undefined' ? 'ServiceWorkerGlobalScope' : typeof self;
    return `Context: ${type}`;
  }));

  return results;
}

async function probeWebCrypto() {
  const results = [];

  results.push(await probe('Web Crypto', 'API exists', () => {
    if (!crypto?.subtle) throw new Error('crypto.subtle is undefined');
    return 'crypto.subtle available';
  }));

  // AES-256-GCM key generation
  results.push(await probe('Web Crypto', 'generateKey (AES-256-GCM)', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    return `Generated key, type=${key.type}, algo=${key.algorithm.name}`;
  }));

  // Encrypt + decrypt round-trip
  results.push(await probe('Web Crypto', 'encrypt + decrypt round-trip', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Sync Freedom probe test!');
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const decoded = new TextDecoder().decode(decrypted);
    if (decoded !== 'Sync Freedom probe test!') throw new Error('Decrypted text mismatch');
    return `Round-trip OK, ciphertext ${ciphertext.byteLength} bytes`;
  }));

  // PBKDF2 (for deriving encryption key from user passphrase)
  results.push(await probe('Web Crypto', 'PBKDF2 key derivation', async () => {
    const passphrase = new TextEncoder().encode('test-passphrase');
    const baseKey = await crypto.subtle.importKey('raw', passphrase, 'PBKDF2', false, ['deriveKey']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return `Derived AES-256-GCM key from PBKDF2, algo=${derivedKey.algorithm.name}`;
  }));

  return results;
}

async function probeIndexedDB() {
  const results = [];

  results.push(await probe('IndexedDB', 'API exists', () => {
    if (!indexedDB) throw new Error('indexedDB is undefined');
    return 'indexedDB available';
  }));

  // Full CRUD
  results.push(await probe('IndexedDB', 'open + CRUD', () => {
    return new Promise((resolve, reject) => {
      const dbName = '_probe_test_' + Date.now();
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(new Error('Failed to open: ' + request.error));

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore('test', { keyPath: 'id' });
      };

      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('test', 'readwrite');
        const store = tx.objectStore('test');

        // Write
        store.put({ id: 'probe-1', data: 'hello', ts: Date.now() });

        tx.oncomplete = () => {
          // Read back
          const tx2 = db.transaction('test', 'readonly');
          const store2 = tx2.objectStore('test');
          const getReq = store2.get('probe-1');

          getReq.onsuccess = () => {
            const val = getReq.result;
            db.close();

            // Cleanup
            const delReq = indexedDB.deleteDatabase(dbName);
            delReq.onsuccess = () => resolve(`CRUD OK — wrote & read id="${val.id}", data="${val.data}"`);
            delReq.onerror = () => resolve(`CRUD OK (cleanup failed) — data="${val.data}"`);
          };

          getReq.onerror = () => {
            db.close();
            reject(new Error('Read failed'));
          };
        };

        tx.onerror = () => {
          db.close();
          reject(new Error('Write transaction failed'));
        };
      };
    });
  }));

  return results;
}

async function probeFetch() {
  const results = [];

  results.push(await probe('Fetch API', 'API exists', () => {
    if (typeof fetch !== 'function') throw new Error('fetch is not a function');
    return 'fetch() available';
  }));

  // Outbound HTTP from service worker
  results.push(await probe('Fetch API', 'outbound GET request', async () => {
    const resp = await fetch('https://httpbin.org/get', { method: 'GET' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return `HTTP ${resp.status}, origin=${data.origin}`;
  }));

  // PUT simulation (for WebDAV-style uploads)
  results.push(await probe('Fetch API', 'outbound PUT request', async () => {
    const resp = await fetch('https://httpbin.org/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true, ts: Date.now() })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return `HTTP ${resp.status} — PUT supported`;
  }));

  // CORS preflight (OPTIONS)
  results.push(await probe('Fetch API', 'CORS behavior', async () => {
    try {
      const resp = await fetch('https://httpbin.org/headers', {
        method: 'GET',
        headers: { 'X-Custom-Header': 'probe' }
      });
      return `HTTP ${resp.status} — custom headers accepted`;
    } catch (e) {
      if (e.message?.includes('CORS') || e.message?.includes('NetworkError')) {
        return 'CORS blocked custom headers (expected in some contexts)';
      }
      throw e;
    }
  }));

  return results;
}

async function probeIdentity() {
  const results = [];

  results.push(await probe('chrome.identity', 'API exists', () => {
    if (!chrome?.identity) throw new Error('chrome.identity is undefined (not in permissions — informational only)');
    return 'chrome.identity namespace available';
  }));

  return results;
}

// ─── Orchestrator ─────────────────────────────────────────────────────

async function runAllProbes() {
  console.log('[API Probe] Starting all probes...');

  const allResults = [];
  const categories = [
    probeChromeTabs,
    probeChromeHistory,
    probeChromeAlarms,
    probeChromeStorage,
    probeChromeRuntime,
    probeServiceWorker,
    probeWebCrypto,
    probeIndexedDB,
    probeFetch,
    probeIdentity,
  ];

  for (const probeFn of categories) {
    try {
      const categoryResults = await probeFn();
      allResults.push(...categoryResults);
    } catch (err) {
      allResults.push(result('PROBE_RUNNER', probeFn.name, 'fail', `Category crashed: ${err.message}`));
    }
  }

  // Gather device info
  const deviceInfo = {
    userAgent: self.navigator?.userAgent ?? 'unavailable',
    platform: self.navigator?.platform ?? 'unavailable',
    language: self.navigator?.language ?? 'unavailable',
    runtimeId: chrome.runtime?.id ?? 'unavailable',
    manifestVersion: chrome.runtime?.getManifest?.()?.manifest_version ?? 'unavailable',
  };

  try {
    const platformInfo = await chrome.runtime.getPlatformInfo();
    deviceInfo.os = platformInfo.os;
    deviceInfo.arch = platformInfo.arch;
  } catch { /* ignore */ }

  const report = {
    version: '1.0.0',
    ranAt: new Date().toISOString(),
    ranAtTs: Date.now(),
    deviceInfo,
    results: allResults,
    summary: {
      total: allResults.length,
      pass: allResults.filter(r => r.status === 'pass').length,
      fail: allResults.filter(r => r.status === 'fail').length,
    },
  };

  // Persist
  await chrome.storage.local.set({ probeReport: report });
  console.log('[API Probe] All probes complete:', report.summary);

  return report;
}

// ─── Lifecycle ────────────────────────────────────────────────────────

// Run on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[API Probe] Extension installed — running probes...');
  runAllProbes();
});

// Listen for "run again" from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RUN_PROBES') {
    runAllProbes().then(report => {
      sendResponse({ success: true, report });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async sendResponse
  }
});
