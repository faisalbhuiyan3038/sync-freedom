import React, { useState, useEffect, useCallback } from 'react';
import type { SyncStatus } from '../background';
import type { DeviceTabList, TabSnapshot } from '../../lib/sync/tabs';
import type { SyncSettings } from '../../lib/adapters/interface';
import { loadSettings } from '../../lib/adapters/factory';
import { getCachedRemoteTabs, getTabSnapshots, captureCurrentTabs } from '../../lib/sync/tabs';
import type { TabEntry } from '../../lib/sync/tabs';
import { SetupWizard } from '../../components/SetupWizard';
import { MyTabsPanel } from '../../components/MyTabsPanel';
import { RemoteTabsPanel } from '../../components/RemoteTabsPanel';
import { TabHistoryPanel } from '../../components/TabHistoryPanel';
import { SettingsPanel } from '../../components/SettingsPanel';
import { LockScreen } from '../../components/LockScreen';

type Tab = 'my-tabs' | 'remote' | 'history' | 'settings';

// ─── Icons ────────────────────────────────────────────────────────────

const IconMyTabs = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const IconRemote = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="4" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="11" y="1" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 8h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IconHistory = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.42 1.42M11.65 11.65l1.42 1.42M2.93 13.07l1.42-1.42M11.65 4.35l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IconSync = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 8a7 7 0 0 1 12-5M15 8a7 7 0 0 1-12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13 2l0 3h-3M3 14v-3H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="popup-logo-icon">
    <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#lg1)" opacity="0.95"/>
    <path d="M2 17l10 5 10-5" stroke="url(#lg2)" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M2 12l10 5 10-5" stroke="url(#lg2)" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <defs>
      <linearGradient id="lg1" x1="2" y1="2" x2="22" y2="12">
        <stop offset="0%" stopColor="#6366f1"/>
        <stop offset="100%" stopColor="#06b6d4"/>
      </linearGradient>
      <linearGradient id="lg2" x1="2" y1="12" x2="22" y2="22">
        <stop offset="0%" stopColor="#6366f1"/>
        <stop offset="100%" stopColor="#06b6d4"/>
      </linearGradient>
    </defs>
  </svg>
);

// ─── App ──────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('my-tabs');
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Data state
  const [myTabs, setMyTabs] = useState<TabEntry[]>([]);
  const [remoteTabs, setRemoteTabs] = useState<DeviceTabList[]>([]);
  const [snapshots, setSnapshots] = useState<TabSnapshot[]>([]);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Refresh data when tab changes
  useEffect(() => {
    if (isUnlocked) loadTabData();
  }, [activeTab, isUnlocked]);

  const loadInitialData = async () => {
    const s = await loadSettings();
    setSettings(s);

    // Check if passphrase is in session
    try {
      const session = await chrome.storage.session?.get('sf_passphrase') ?? {};
      setIsUnlocked(!!session['sf_passphrase']);
    } catch {
      // No session storage support — ask for passphrase
      setIsUnlocked(false);
    }

    // Get sync status
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);
    if (response?.status) setSyncStatus(response.status as SyncStatus);
  };

  const loadTabData = async () => {
    const [tabs, remote, snaps] = await Promise.all([
      captureCurrentTabs(),
      getCachedRemoteTabs(),
      getTabSnapshots(),
    ]);
    setMyTabs(tabs);
    setRemoteTabs(remote);
    setSnapshots([...snaps].reverse()); // newest first
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
      await loadTabData();
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);
      if (response?.status) setSyncStatus(response.status as SyncStatus);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleUnlock = async (passphrase: string) => {
    await chrome.runtime.sendMessage({ type: 'SET_PASSPHRASE', payload: { passphrase } });
    setIsUnlocked(true);
    await loadTabData();
  };

  const handleSetupComplete = async (newSettings: SyncSettings) => {
    setSettings(newSettings);
    await chrome.runtime.sendMessage({ type: 'REGISTER_ALARM' });
    await handleSync();
  };

  const handleSettingsChange = async () => {
    const s = await loadSettings();
    setSettings(s);
  };

  // ── No settings yet → show setup wizard ──
  if (!settings) {
    return <div className="popup-root"><div className="popup-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'var(--text-muted)' }}>Loading…</span></div></div>;
  }

  if (!settings.credentials) {
    return (
      <div className="popup-root">
        <SetupWizard onComplete={handleSetupComplete} />
      </div>
    );
  }

  // ── Passphrase lock screen ──
  if (!isUnlocked) {
    return (
      <div className="popup-root">
        <LockScreen onUnlock={handleUnlock} />
      </div>
    );
  }

  // ── Main app ──
  return (
    <div className="popup-root">
      {/* Header */}
      <header className="popup-header">
        <div className="popup-logo">
          <IconLogo />
          <span className="popup-logo-text">Sync Freedom</span>
        </div>
        <button
          className={`popup-sync-btn${isSyncing ? ' syncing' : ''}`}
          onClick={handleSync}
          disabled={isSyncing}
          title="Sync now"
        >
          <IconSync />
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
      </header>

      {/* Status bar */}
      <SyncStatusBar status={syncStatus} isSyncing={isSyncing} />

      {/* Nav */}
      <nav className="popup-nav">
        <NavTabBtn
          id="my-tabs"
          icon={<IconMyTabs />}
          label="My Tabs"
          active={activeTab === 'my-tabs'}
          badge={myTabs.length > 0 ? myTabs.length : undefined}
          onClick={() => setActiveTab('my-tabs')}
        />
        <NavTabBtn
          id="remote"
          icon={<IconRemote />}
          label="Remote"
          active={activeTab === 'remote'}
          badge={remoteTabs.length > 0 ? remoteTabs.length : undefined}
          onClick={() => setActiveTab('remote')}
        />
        <NavTabBtn
          id="history"
          icon={<IconHistory />}
          label="History"
          active={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        />
        <NavTabBtn
          id="settings"
          icon={<IconSettings />}
          label="Settings"
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
        />
      </nav>

      {/* Panels */}
      <div className="popup-panel animate-in" key={activeTab}>
        {activeTab === 'my-tabs' && <MyTabsPanel tabs={myTabs} />}
        {activeTab === 'remote' && <RemoteTabsPanel devices={remoteTabs} />}
        {activeTab === 'history' && <TabHistoryPanel snapshots={snapshots} />}
        {activeTab === 'settings' && (
          <SettingsPanel settings={settings} onSaved={handleSettingsChange} />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function NavTabBtn({ id, icon, label, active, badge, onClick }: {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button id={`nav-${id}`} className={`nav-tab${active ? ' active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="badge">{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}

function SyncStatusBar({ status, isSyncing }: { status: SyncStatus | null; isSyncing: boolean }) {
  let dotClass = '';
  let text = 'Not synced yet';

  if (isSyncing) {
    dotClass = 'syncing';
    text = 'Syncing…';
  } else if (status?.lastSyncResult === 'success' && status.lastSyncAt) {
    dotClass = 'success';
    text = `Synced ${formatRelative(status.lastSyncAt)}`;
    if (status.remoteDeviceCount > 0) {
      text += ` · ${status.remoteDeviceCount} device${status.remoteDeviceCount !== 1 ? 's' : ''}`;
    }
  } else if (status?.lastSyncResult === 'error') {
    dotClass = 'error';
    text = `Error: ${status.lastError ?? 'Unknown error'}`;
  }

  return (
    <div className="status-bar">
      <span className={`status-dot${dotClass ? ' ' + dotClass : ''}`} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}
