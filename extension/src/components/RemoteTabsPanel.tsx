import React, { useState } from 'react';
import type { DeviceTabList } from '../lib/sync/tabs';
import { TabRow, EmptyState } from './MyTabsPanel';

interface RemoteTabsPanelProps {
  devices: DeviceTabList[];
}

export function RemoteTabsPanel({ devices }: RemoteTabsPanelProps) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="17" y="2" width="5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M15 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        }
        title="No remote devices yet"
        desc="Other devices with Sync Freedom installed will appear here after their first sync."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {devices.map(device => (
        <DeviceAccordion key={device.deviceId} device={device} />
      ))}
    </div>
  );
}

function DeviceAccordion({ device }: { device: DeviceTabList }) {
  const [open, setOpen] = useState(true);

  const isDesktop = /Desktop|Windows|macOS|Linux|ChromeOS/.test(device.deviceName);
  const isMobile = /Android|iOS/.test(device.deviceName);

  const openTab = (url: string) => {
    chrome.tabs.create({ url });
  };

  const staleMs = Date.now() - device.lastUpdated;
  const staleText = formatAge(staleMs);
  const isStale = staleMs > 30 * 60 * 1000; // >30 min

  return (
    <div className="device-group">
      <div className="device-header" onClick={() => setOpen(o => !o)}>
        <div className="device-icon">
          {isMobile ? <MobileIcon /> : isDesktop ? <DesktopIcon /> : <DefaultIcon />}
        </div>
        <div className="device-meta">
          <div className="device-name">{device.deviceName}</div>
          <div className="device-updated" style={{ color: isStale ? 'var(--warn)' : 'var(--text-muted)' }}>
            {device.tabs.length} tab{device.tabs.length !== 1 ? 's' : ''} · {staleText}
          </div>
        </div>
        <svg
          className={`device-chevron${open ? ' open' : ''}`}
          viewBox="0 0 16 16" fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {open && (
        <div className="device-body animate-in">
          {device.tabs.length === 0 ? (
            <div style={{ padding: '8px 4px', color: 'var(--text-muted)', fontSize: '11.5px', textAlign: 'center' }}>
              No tabs open on this device
            </div>
          ) : (
            <div className="tab-list">
              {device.tabs.map((tab, i) => (
                <TabRow
                  key={i}
                  tab={tab}
                  onClick={() => openTab(tab.url)}
                />
              ))}
            </div>
          )}
          <div style={{ padding: '8px 4px 2px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => device.tabs.forEach(t => chrome.tabs.create({ url: t.url }))}
              title="Open all tabs from this device"
            >
              Open all tabs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function DesktopIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="12" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="4" y="1" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="13" r="0.75" fill="currentColor"/>
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="6.5" x2="15" y2="6.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
