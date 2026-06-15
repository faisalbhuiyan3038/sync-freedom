import React from 'react';
import type { TabEntry } from '../lib/sync/tabs';
import { getFaviconUrl } from '../utils/favicon';

interface MyTabsPanelProps {
  tabs: TabEntry[];
}

export function MyTabsPanel({ tabs }: MyTabsPanelProps) {
  if (tabs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="1.5"/></svg>
        }
        title="No open tabs"
        desc="All your open tabs will appear here. Internal browser pages are excluded."
      />
    );
  }

  const pinned = tabs.filter(t => t.pinned);
  const unpinned = tabs.filter(t => !t.pinned);

  return (
    <div>
      {pinned.length > 0 && (
        <div className="settings-section">
          <div className="section-header">
            <span className="section-title">Pinned</span>
            <span className="section-count">{pinned.length}</span>
          </div>
          <div className="tab-list">
            {pinned.map((tab, i) => (
              <TabRow key={i} tab={tab} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="section-header">
          <span className="section-title">Open Tabs</span>
          <span className="section-count">{unpinned.length}</span>
        </div>
        <div className="tab-list">
          {unpinned.map((tab, i) => (
            <TabRow key={i} tab={tab} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TabRow({
  tab,
  onClick,
}: {
  tab: TabEntry;
  onClick?: () => void;
}) {
  const favicon = getFaviconUrl(tab.url, tab.favIconUrl);
  let hostname = '';
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    hostname = tab.url;
  }

  return (
    <div
      className={`tab-item${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      title={tab.url}
    >
      <img
        className="tab-favicon"
        src={favicon}
        alt=""
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="tab-info">
        <div className="tab-title">{tab.title}</div>
        <div className="tab-url">{hostname}</div>
      </div>
      {tab.pinned && <span className="tab-pin" title="Pinned">📌</span>}
      {onClick && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, desc }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{desc}</div>
    </div>
  );
}
