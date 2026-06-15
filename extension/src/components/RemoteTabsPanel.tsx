import React, { useState } from 'react';
import type { DeviceTabList } from '../lib/sync/tabs';
import { TabRow, EmptyState } from './MyTabsPanel';

interface RemoteTabsPanelProps {
  devices: DeviceTabList[];
  onRefresh?: () => void;
}

export function RemoteTabsPanel({ devices, onRefresh }: RemoteTabsPanelProps) {
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
        <DeviceAccordion key={device.deviceId} device={device} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function DeviceAccordion({ device, onRefresh }: { device: DeviceTabList; onRefresh?: () => void }) {
  const [open, setOpen] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (device.decryptionFailed) {
    const handlePruneClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteError(null);
      setConfirmDelete(true);
    };

    const handleCancelDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmDelete(false);
    };

    const handleConfirmDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!device.filePath) return;
      setIsDeleting(true);
      setDeleteError(null);
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'DELETE_REMOTE_FILE',
          payload: { filePath: device.filePath }
        });
        if (resp && resp.success) {
          if (onRefresh) onRefresh();
        } else {
          setDeleteError(resp?.error || 'Unknown error');
          setConfirmDelete(false);
        }
      } catch (err) {
        setDeleteError(String(err));
        setConfirmDelete(false);
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <div className="device-group" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <div className="device-header" onClick={() => setOpen(o => !o)} style={{ background: 'rgba(239, 68, 68, 0.04)' }}>
          <div className="device-icon" style={{ background: 'var(--error-bg)' }}>
            <span style={{ fontSize: '13px' }}>⚠️</span>
          </div>
          <div className="device-meta">
            <div className="device-name" style={{ color: 'var(--error)', fontSize: '12px' }}>{device.deviceName}</div>
            <div className="device-updated" style={{ color: 'var(--text-muted)' }}>
              Decryption failed
            </div>
          </div>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '4px' }}
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px' }}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Removing...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-danger"
              style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', marginLeft: 'auto' }}
              onClick={handlePruneClick}
              disabled={isDeleting}
            >
              Remove
            </button>
          )}
        </div>
        {deleteError && (
          <div style={{ padding: '6px 12px', color: 'var(--error)', fontSize: '11px', background: 'rgba(239,68,68,0.08)', borderTop: '1px dashed rgba(239,68,68,0.2)' }}>
            Error: {deleteError}
          </div>
        )}
        {open && (
          <div className="device-body animate-in" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4', padding: '10px 12px' }}>
            This file was encrypted with a different key or salt (possibly before you set up manifest-based salt sharing). Click <strong>Remove</strong> and then <strong>Confirm</strong> to delete it from your WebDAV/Koofr storage and clear this error.
          </div>
        )}
      </div>
    );
  }

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
