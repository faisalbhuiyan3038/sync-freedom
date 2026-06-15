You're completely right. I underestimated the rise of Chromium-based Android browsers supporting extensions (Kiwi, Quetta, Helium, Edge, etc.). That fundamentally changes the architecture—we don't need a companion app at all. A single Manifest V3 extension running on both desktop and mobile handles everything natively.

Let's zero in strictly on **History** and **Open Tabs**, with a pluggable "Bring Your Own Storage" backend.

---

### I. The Simplified Architecture (Extension-Only)

Because the extension runs natively on both desktop and mobile, we can read and write directly to the browser's APIs. No Android Autofill, no companion app.

```text
┌─────────────────────────────────────────────────┐
│            BROWSER EXTENSION (MV3)              │
│          (Runs on Desktop + Mobile)             │
│                                                 │
│  ┌───────────────┐       ┌──────────────────┐   │
│  │  History Sync │       │   Tabs Sync      │   │
│  │  (Append-mostly)│      │  (State-based)   │   │
│  └───────┬───────┘       └────────┬─────────┘   │
│          │                        │              │
│  ┌───────▼────────────────────────▼──────────┐  │
│  │            SYNC ENGINE                     │  │
│  │  • Delta generation & merging             │  │
│  │  • Debouncing (prevent API spam)          │  │
│  │  • Device registration                    │  │
│  └───────────────────┬───────────────────────┘  │
│                      │                          │
│  ┌───────────────────▼───────────────────────┐  │
│  │      ENCRYPTION LAYER (AES-256-GCM)       │  │
│  └───────────────────┬───────────────────────┘  │
│                      │                          │
│  ┌───────────────────▼───────────────────────┐  │
│  │          STORAGE ADAPTER                   │  │
│  │  (User picks one, inputs credentials)     │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ │  │
│  │  │WebDAV│ │GitHub│ │GDrive│ │Dropbox/S3│ │  │
│  │  └──────┘ └──────┘ └──────┘ └──────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

### II. Open Tabs Sync (The Easy Part)

Open tabs are surprisingly simple because **devices never conflict with each other**. Device A only overwrites Device A's tab list. It just reads Device B's tab list.

**Data Structure on Storage Backend:**
```json
// /tabs/device_{deviceId}.json.enc
{
  "deviceId": "vivaldi_desktop_01",
  "deviceName": "Vivaldi (Work)",
  "lastUpdated": 1700000000,
  "tabs": [
    { "url": "https://github.com", "title": "GitHub", "favIconUrl": "..." },
    { "url": "https://reddit.com", "title": "Reddit", "favIconUrl": "..." }
  ]
}
```

**Sync Logic:**
1. **Push (Debounced):** When a tab is created/updated/removed locally, wait 5 seconds, then encrypt and `PUT` your device's file to the backend.
2. **Pull (Polled or On-Demand):** Fetch the directory listing (or manifest), download other devices' files, decrypt, and display in the extension popup.
3. **Action:** Clicking a remote tab calls `chrome.tabs.create({ url: "..." })`.

*No CRDTs needed. No conflict resolution needed. Just overwrite your own file.*

---

### III. History Sync (The Hard Part)

History is high-volume and append-heavy. It requires delta sync and deduplication.

**APIs Used:**
*   `chrome.history.onVisited` — Fires every time a page loads.
*   `chrome.history.search` — Pulls bulk history.
*   `chrome.history.deleteUrl` — (Optional) Syncing deletions.

**Sync Logic (Delta-based):**

1. **Capture Locally:** Listen to `chrome.history.onVisited`. Write to a local IndexedDB queue.
2. **Push Deltas:** Every X seconds, bundle new visits since last sync, encrypt, and upload as a delta file.
3. **Pull & Merge:** Fetch deltas from other devices since your last cursor. 
4. **Apply Remotely:** Call `chrome.history.addUrl({ url, title })` to inject remote history into the local browser.
5. **Apply Locally:** Local visits are already in the browser.

**Deduplication Strategy:**
Browsers natively deduplicate history by URL, incrementing the `visitCount`. To replicate this across devices:
```javascript
// Delta format
{
  url: "https://example.com",
  title: "Example",
  visits: [1700000000, 1700000050] // timestamps of visits from this device
}

// When merging: Union all visit timestamps across all devices.
// If Device A has 2 visits and Device B has 1 visit, merged visitCount = 3.
```

**Storage Layout:**
```text
/history/
  ├── snapshot.json.enc          ← Full state (generated weekly for fast recovery)
  └── deltas/
      ├── 1700000001.json.enc    ← Small encrypted chunks of new visits
      └── 1700000002.json.enc
```

---

### IV. Pluggable Backend Implementation

You build an interface. The user chooses their backend in the settings and inputs their credentials.

```typescript
interface StorageAdapter {
  // Test connection
  authenticate(credentials: any): Promise<boolean>;
  
  // Tabs: Simple file read/write per device
  putDeviceTabs(deviceId: string, encryptedData: ArrayBuffer): Promise<void>;
  getDeviceTabsList(): Promise<string[]>; // Returns list of device IDs
  getDeviceTabs(deviceId: string): Promise<ArrayBuffer>;
  
  // History: Delta management
  pushDelta(timestamp: number, encryptedData: ArrayBuffer): Promise<void>;
  getDeltasSince(cursor: number): Promise<ArrayBuffer[]>;
  pushSnapshot(encryptedData: ArrayBuffer): Promise<void>;
  getSnapshot(): Promise<ArrayBuffer>;
}
```

**Adapter Specifics:**

| Adapter | How the User Authenticates | Mechanism |
|---|---|---|
| **WebDAV** | URL + Username + Password | Standard HTTP PUT/GET/PROPFIND with Basic Auth. Works with Nextcloud, pCloud, Koofr, Synology. |
| **GitHub** | Personal Access Token (PAT) | REST API v3. User creates a private repo. Deltas are committed as files. |
| **Google Drive** | OAuth2 flow | Store files in the app's hidden data folder. 15GB free. |
| **Dropbox** | OAuth2 flow or App Key | Upload/download to `/Apps/BrowserSync/`. 2GB free. |
| **Backblaze B2 / S3** | KeyID + Application Key | Extremely cheap (B2 has 10GB free). Perfect for delta files. |

---

### V. Handling the Mobile Extension Differences

Even though Quetta/Helium/Kiwi support extensions, there are mobile-specific edge cases:

1. **Background Execution:** Mobile browsers frequently kill extension background scripts (Service Workers) to save battery.
   * *Fix:* Rely heavily on `chrome.alarms` (minimum 1-minute interval in MV3) to wake up the extension, sync deltas, and go back to sleep. Do not attempt real-time tab pushing on mobile; sync on an alarm schedule.
2. **Tab Events:** Mobile browsers often don't fire `chrome.tabs.onUpdated` as reliably as desktop, or they fire differently due to tab discarding.
   * *Fix:* On alarm wake-up, do a full `chrome.tabs.query({})` and diff against the last pushed state to ensure accuracy, rather than relying solely on event listeners.
3. **FavIcons:** Browsers don't sync favicons across devices. 
   * *Fix:* Use a free public API like `https://www.google.com/s2/favicons?domain=example.com&sz=32` to fetch icons for the remote tabs UI so it looks native.

---

### VI. Revised Development Timeline

Since we dumped the companion app, passwords, and bookmarks, the scope is dramatically smaller.

**Phase 1: Core + Tabs (2-3 weeks)**
* Storage Adapter Interface
* WebDAV Adapter (most universal for self-hosters)
* GitHub Adapter (easiest zero-config for devs)
* Encryption module
* Device ID generation
* Tab sync (push local, pull remote, UI to view/open remote tabs)

**Phase 2: History Sync (2-3 weeks)**
* `chrome.history` event capturing to local queue
* Delta generation & pushing
* Delta fetching & merging (union of visits)
* Calling `chrome.history.addUrl` to apply remote history locally
* Snapshot generation (weekly compress of deltas)

**Phase 3: More Backends + Polish (2 weeks)**
* Google Drive Adapter
* Dropbox / S3 Adapter
* First-run setup wizard
* Mobile-specific alarm tuning
* UI for sync status/errors

**Total: ~6-8 weeks to a robust, cross-platform History + Tabs sync tool.**

By skipping bookmarks and passwords, you avoid the nastiest CRDT tree-merge problems and security audit requirements. History and Tabs are mostly state-based and append-mostly, making them highly reliable to sync over user-provided storage.