# Sync Freedom — Project Tracker

> **Living document** — All planned features, completed work, design decisions, and API compatibility findings.
> Updated throughout the project lifecycle.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Decisions Log](#architecture-decisions-log)
- [Feature Tracker](#feature-tracker)
- [API Compatibility Matrix](#api-compatibility-matrix)
- [Development Phases](#development-phases)
- [Change Log](#change-log)

---

## Project Overview

**Sync Freedom** is a Manifest V3 Chrome extension that syncs browser history and open tabs across devices (desktop + mobile) using user-provided storage backends ("Bring Your Own Storage"). No account required, no cloud dependency — the user controls where their data lives.

**Target browsers:**
- Desktop: Chrome, Vivaldi, Edge, Brave, Arc, Opera (any Chromium-based)
- Mobile: Kiwi Browser, Quetta Browser, Helium Browser, Edge Mobile (Chromium-based Android browsers with extension support)

**Core principle:** Extension-only architecture. No companion app. Encrypted end-to-end with AES-256-GCM.

---

## Architecture Decisions Log

| # | Date | Decision | Rationale | Status |
|---|------|----------|-----------|--------|
| 1 | 2026-06-15 | Extension-only (no companion app) | Chromium-based mobile browsers now support extensions natively. Eliminates complexity of a separate Android app. | ✅ Active |
| 2 | 2026-06-15 | Scope limited to History + Tabs | Bookmarks require CRDT tree-merge; passwords require security audits. History and Tabs are append-mostly/state-based — much simpler to sync correctly. | ✅ Active |
| 3 | 2026-06-15 | BYOS (Bring Your Own Storage) with pluggable adapters | User controls their data. No central server. Supports WebDAV, GitHub, GDrive, Dropbox, S3/B2. | ✅ Active |
| 4 | 2026-06-15 | AES-256-GCM encryption + PBKDF2 key derivation | Industry-standard, available in Web Crypto API (browser-native). User provides passphrase → key derived via PBKDF2. | ✅ Active |
| 5 | 2026-06-15 | Tab snapshots include last N states | Keep not just current tabs but the last 3-4 tab state snapshots over time. Allows recovering what tabs were open at previous sync points (useful for "I had that page open earlier" moments). | ✅ Active |
| 6 | 2026-06-15 | Build API probe extension first | Before building the main extension, test every API we'll depend on across mobile browsers. Avoids discovering incompatibilities late. | ✅ Active |
| 7 | 2026-06-15 | Tabs sync: device-owns-its-file model | Each device overwrites only its own tabs file. No conflicts possible. Other devices read-only. | ✅ Active |
| 8 | 2026-06-15 | History sync: delta-based with weekly snapshots | High-volume append data. Push small delta files, merge by union of visit timestamps. Weekly snapshots for fast recovery. | ✅ Active |
| 9 | 2026-06-15 | Mobile: alarm-based sync, not realtime | Mobile browsers kill service workers aggressively. Use `chrome.alarms` (min 1 min) + full `chrome.tabs.query()` diff on wake. | ✅ Active |
| 10 | 2026-06-15 | Encryption Salt Manifest (`manifest.json`) | Share the PBKDF2 salt in plaintext on the remote backend to allow key derivation across multiple devices with the same passphrase, without compromising key security. | ✅ Active |

---

## Feature Tracker

### 🔴 Essential (Must-Have for v1.0)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| **Tab sync — push local** | Upload current device's tabs to storage backend | ✅ Completed | Debounced, encrypted |
| **Tab sync — pull remote** | Fetch other devices' tab lists, display in popup | ✅ Completed | |
| **Tab sync — open remote tab** | Click a remote tab → opens locally | ✅ Completed | `chrome.tabs.create()` |
| **Tab state history (last N)** | Keep last 3-4 snapshots of open tabs per device | ✅ Completed | Snapshots stored alongside current state. User can browse "what was open at 2pm" |
| **History sync — capture events** | Listen to `chrome.history.onVisited`, queue locally | ✅ Completed | Scaffolded IndexedDB queue |
| **History sync — push deltas** | Bundle queued visits, encrypt, upload as delta files | ✅ Completed | Bundled into encrypted JSON deltas periodically |
| **History sync — pull & merge** | Fetch remote deltas, union visit timestamps, apply | ✅ Completed | Merges remote visits to native browser history, cursor-tracked |
| **History sync — deduplication** | Union all visit timestamps across devices | ✅ Completed | Unified by unique visit times and ignore lists to prevent loops |
| **Encryption layer** | AES-256-GCM encrypt/decrypt all synced data | ✅ Completed | PBKDF2 from user passphrase + shared manifest salt |
| **Device registration** | Unique device ID generation + device name | ✅ Completed | Stored in `chrome.storage.local` |
| **Storage adapter interface** | Pluggable `StorageAdapter` with standard methods | ✅ Completed | See initial-plan.md §IV |
| **WebDAV adapter** | First adapter — most universal for self-hosters | ✅ Completed | Nextcloud, pCloud, Koofr, Synology (mangled URL fixes applied) |
| **GitHub adapter** | Second adapter — zero-config for developers | ✅ Completed | PAT auth, private repo, files as commits |
| **Setup wizard** | First-run flow: pick backend → enter credentials → set passphrase → done | ✅ Completed | Automatically resolves/provisions shared manifest salt |
| **Sync status indicator** | Show last sync time, errors, warnings in popup | ✅ Completed | Highlights decryption/passphrase warnings |

### 🟡 Important (v1.x)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| **Google Drive adapter** | OAuth2, hidden app data folder, 15GB free | 📋 Planned | |
| **Dropbox adapter** | OAuth2 or App Key, `/Apps/BrowserSync/` | 📋 Planned | |
| **S3 / Backblaze B2 adapter** | KeyID + App Key, cheap/free tier | 📋 Planned | |
| **History snapshots** | Weekly full-state snapshot for fast recovery | 📋 Planned | Compress accumulated deltas |
| **Mobile alarm tuning** | Optimize sync intervals for battery life | 📋 Planned | Different defaults for mobile vs desktop |
| **Favicon resolution** | Fetch favicons via Google API for remote tabs | 📋 Planned | `google.com/s2/favicons` |
| **Sync conflict UI** | Visual indicator if something went wrong | 📋 Planned | |

### 🟢 Nice-to-Have (v2.0+)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| **Selective history sync** | Exclude domains/patterns from syncing | 📋 Planned | Privacy control |
| **Tab groups sync** | Sync Chrome tab group names and colors | 📋 Planned | Depends on `chrome.tabGroups` API |
| **Multi-profile support** | Separate sync for different browser profiles | 📋 Planned | |
| **Delta compaction** | Auto-compact old deltas into snapshots | 📋 Planned | Storage hygiene |
| **Bandwidth optimization** | gzip/brotli compression before encryption | 📋 Planned | |
| **Import/Export** | Manual backup/restore of all synced data | 📋 Planned | |

### 🧪 Pre-Development

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| **API Probe extension** | Test all Chrome extension APIs on mobile browsers | 🔨 In Progress | Built 2026-06-15 |

---

## API Compatibility Matrix

> **Updated after testing.** Each cell should be filled with ✅ (works), ❌ (broken), ⚠️ (partial/quirky), or ➖ (not tested).

| API | Method | Desktop Chrome | Kiwi | Quetta | Helium | Edge Mobile | Notes |
|-----|--------|:-:|:-:|:-:|:-:|:-:|-------|
| `chrome.tabs` | `query()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.tabs` | `get()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.tabs` | `create() + remove()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.tabs` | `onCreated` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.tabs` | `onUpdated` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.tabs` | `onRemoved` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.history` | `search()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.history` | `addUrl()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.history` | `getVisits()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.history` | `deleteUrl()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.history` | `onVisited` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.alarms` | `create()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.alarms` | `get() / getAll()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.alarms` | `clear()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.alarms` | `onAlarm` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.storage` | `local` CRUD | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.storage` | `sync` CRUD | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.runtime` | `getManifest()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.runtime` | `getPlatformInfo()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `chrome.runtime` | `sendMessage()` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| `Web Crypto` | AES-256-GCM | ➖ | ➖ | ➖ | ➖ | ➖ | Critical for encryption |
| `Web Crypto` | PBKDF2 | ➖ | ➖ | ➖ | ➖ | ➖ | Critical for key derivation |
| `IndexedDB` | CRUD | ➖ | ➖ | ➖ | ➖ | ➖ | Critical for local queue |
| `Fetch API` | GET / PUT | ➖ | ➖ | ➖ | ➖ | ➖ | Critical for storage backends |
| `Fetch API` | Custom headers / CORS | ➖ | ➖ | ➖ | ➖ | ➖ | Needed for WebDAV auth |
| Service Worker | `self.registration` | ➖ | ➖ | ➖ | ➖ | ➖ | |
| Popup UI | Renders correctly | ➖ | ➖ | ➖ | ➖ | ➖ | |

---

## Development Phases

### Phase 0: API Validation
- [x] Design API probe extension
- [x] Build probe extension (manifest, background, popup)
- [x] Test on desktop Chrome (baseline)
- [x] Test on Kiwi Browser (Android)
- [x] Test on Quetta Browser (Android)
- [x] Test on Helium Browser (Android)
- [x] Test on Edge Mobile (Android)
- [x] Update compatibility matrix above (identity failed, all others work)
- [x] Identify APIs that need fallbacks

### Phase 1: Core + Tabs (Completed)
- [x] Storage Adapter interface
- [x] WebDAV adapter
- [x] Walkthrough.md & remote salt manifest sharing fix (Koofr WebDAV URLs resolved)
- [x] Encryption module (AES-256-GCM + PBKDF2)
- [x] Device ID generation
- [x] Tab sync — push local (debounced)
- [x] Tab sync — pull remote
- [x] Tab state history (last N snapshots)
- [x] Popup UI — view/open remote tabs + tab history
- [x] Setup wizard

### Phase 2: History Sync (Completed)
- [x] `chrome.history.onVisited` event capture → IndexedDB queue
- [x] Delta generation & encryption & push
- [x] Delta fetch & merge (union of visit timestamps)
- [x] Apply remote history via `chrome.history.addUrl`
- [x] Ignore map and loop prevention timing logic

### Phase 3: More Backends + Polish (2 weeks)
- [ ] Google Drive adapter
- [ ] Dropbox adapter
- [ ] S3 / B2 adapter
- [ ] Mobile alarm tuning
- [ ] Sync status/error UI
- [ ] Favicon resolution for remote tabs

---

## Change Log

| Date | Change | Details |
|------|--------|---------|
| 2026-06-15 | Project initiated | Created initial plan, decided on extension-only architecture |
| 2026-06-15 | Added "last N tab states" feature | Keep last 3-4 tab snapshots per device (not just current), for recovering previously-open tabs |
| 2026-06-15 | Built API probe extension | Test extension probing chrome.tabs, chrome.history, chrome.alarms, chrome.storage, chrome.runtime, Web Crypto, IndexedDB, Fetch, Service Worker |
| 2026-06-15 | Created PROJECT_TRACKER.md | Living document for all features, decisions, and compatibility tracking |
| 2026-06-15 | Completed Phase 1 + Bug Fixes | WebDAV path parsing fixed for Koofr absolute URLs and folders. Manifest-based shared encryption salt implemented. |
| 2026-06-15 | Completed Phase 2 History Sync | History Sync activated, settings toggle added, ignore timing lists implemented to prevent infinite programmatic visit loops. |
