import React, { useState } from 'react';
import type { TabSnapshot } from '../lib/sync/tabs';
import { TabRow, EmptyState } from './MyTabsPanel';

interface TabHistoryPanelProps {
  snapshots: TabSnapshot[];
}

export function TabHistoryPanel({ snapshots }: TabHistoryPanelProps) {
  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
        title="No snapshots yet"
        desc="Each time your tabs change, Sync Freedom saves a snapshot. Your last few states will appear here."
      />
    );
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Tab State History</span>
        <span className="section-count">{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="snapshot-list">
        {snapshots.map((snapshot, index) => (
          <SnapshotItem
            key={snapshot.timestamp}
            snapshot={snapshot}
            isLatest={index === 0}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotItem({ snapshot, isLatest }: { snapshot: TabSnapshot; isLatest: boolean }) {
  const [open, setOpen] = useState(isLatest);

  const date = new Date(snapshot.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = isToday(date)
    ? `Today at ${timeStr}`
    : isYesterday(date)
    ? `Yesterday at ${timeStr}`
    : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;

  const openAll = () => {
    snapshot.tabs.forEach(tab => chrome.tabs.create({ url: tab.url }));
  };

  return (
    <div className="snapshot-item">
      <div className="snapshot-header" onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLatest && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '2px 6px',
              borderRadius: '20px',
              background: 'var(--accent-dim)',
              color: 'var(--accent-hover)',
              border: '1px solid rgba(99,102,241,0.3)',
              flexShrink: 0,
            }}>
              Latest
            </span>
          )}
          <span className="snapshot-time">{dateStr}</span>
        </div>
        <span className="snapshot-tab-count">
          {snapshot.tabs.length} tab{snapshot.tabs.length !== 1 ? 's' : ''}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{
            color: 'var(--text-muted)',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {open && (
        <div className="snapshot-body animate-in">
          <div className="tab-list">
            {snapshot.tabs.map((tab, i) => (
              <TabRow
                key={i}
                tab={tab}
                onClick={() => chrome.tabs.create({ url: tab.url })}
              />
            ))}
          </div>
          {snapshot.tabs.length > 1 && (
            <div style={{ padding: '8px 4px 2px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={openAll}
              >
                Restore all {snapshot.tabs.length} tabs
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}
