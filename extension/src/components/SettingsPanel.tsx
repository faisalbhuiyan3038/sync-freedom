import React, { useState } from 'react';
import type { SyncSettings, AdapterCredentials } from '../lib/adapters/interface';
import { saveSettings } from '../lib/adapters/factory';
import { setDeviceName, getDeviceInfo } from '../lib/device';

interface SettingsPanelProps {
  settings: SyncSettings;
  onSaved: () => void;
}

export function SettingsPanel({ settings, onSaved }: SettingsPanelProps) {
  const [backend, setBackend] = useState<'webdav' | 'github'>(
    settings.credentials?.type ?? 'webdav',
  );
  const [snapCount, setSnapCount] = useState(settings.tabSnapshotCount);
  const [intervalMin, setIntervalMin] = useState(settings.syncIntervalMinutes);
  const [deviceNameVal, setDeviceNameVal] = useState('');
  const [connResult, setConnResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // WebDAV fields
  const wdCreds = settings.credentials?.type === 'webdav' ? settings.credentials : null;
  const [wdUrl, setWdUrl] = useState(wdCreds?.url ?? '');
  const [wdUser, setWdUser] = useState(wdCreds?.username ?? '');
  const [wdPass, setWdPass] = useState(wdCreds?.password ?? '');

  // GitHub fields
  const ghCreds = settings.credentials?.type === 'github' ? settings.credentials : null;
  const [ghToken, setGhToken] = useState(ghCreds?.token ?? '');
  const [ghOwner, setGhOwner] = useState(ghCreds?.owner ?? '');
  const [ghRepo, setGhRepo] = useState(ghCreds?.repo ?? '');
  const [ghBranch, setGhBranch] = useState(ghCreds?.branch ?? 'main');

  React.useEffect(() => {
    getDeviceInfo().then(info => setDeviceNameVal(info.deviceName));
  }, []);

  const buildCredentials = (): AdapterCredentials => {
    if (backend === 'webdav') {
      return { type: 'webdav', url: wdUrl, username: wdUser, password: wdPass };
    }
    return { type: 'github', token: ghToken, owner: ghOwner, repo: ghRepo, branch: ghBranch };
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnResult(null);
    try {
      const creds = buildCredentials();
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        payload: { credentials: creds },
      });
      if (response.success) {
        setConnResult({ ok: true, msg: 'Connection successful! ✓' });
      } else {
        setConnResult({ ok: false, msg: response.error ?? 'Connection failed' });
      }
    } catch (err) {
      setConnResult({ ok: false, msg: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const creds = buildCredentials();
      await saveSettings({
        credentials: creds,
        tabSnapshotCount: snapCount,
        syncIntervalMinutes: Math.max(1, intervalMin),
      });
      if (deviceNameVal.trim()) {
        await setDeviceName(deviceNameVal);
      }
      // Re-register alarm with new interval
      await chrome.runtime.sendMessage({ type: 'REGISTER_ALARM' });
      onSaved();
      setConnResult({ ok: true, msg: 'Settings saved!' });
    } catch (err) {
      setConnResult({ ok: false, msg: `Save failed: ${err}` });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {/* Storage backend */}
      <div className="settings-section">
        <div className="settings-section-title">Storage Backend</div>

        <div className="form-group">
          <label className="form-label">Backend Type</label>
          <select
            id="settings-backend-type"
            className="form-select"
            value={backend}
            onChange={e => setBackend(e.target.value as 'webdav' | 'github')}
          >
            <option value="webdav">WebDAV (Nextcloud, pCloud, Koofr…)</option>
            <option value="github">GitHub (Private repo)</option>
          </select>
        </div>

        {backend === 'webdav' && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="settings-wd-url">WebDAV URL</label>
              <input
                id="settings-wd-url"
                type="url"
                className="form-input"
                placeholder="https://my.nextcloud.com/remote.php/dav/files/user/"
                value={wdUrl}
                onChange={e => setWdUrl(e.target.value)}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="settings-wd-user">Username</label>
                <input id="settings-wd-user" type="text" className="form-input" placeholder="username" value={wdUser} onChange={e => setWdUser(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="settings-wd-pass">Password</label>
                <input id="settings-wd-pass" type="password" className="form-input" placeholder="••••••••" value={wdPass} onChange={e => setWdPass(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {backend === 'github' && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="settings-gh-token">Personal Access Token</label>
              <input id="settings-gh-token" type="password" className="form-input" placeholder="ghp_xxxxxxxxxxxx" value={ghToken} onChange={e => setGhToken(e.target.value)} />
              <div className="form-hint">Needs "Contents: read+write" permission on your repo.</div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="settings-gh-owner">Owner</label>
                <input id="settings-gh-owner" type="text" className="form-input" placeholder="yourusername" value={ghOwner} onChange={e => setGhOwner(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="settings-gh-repo">Repository</label>
                <input id="settings-gh-repo" type="text" className="form-input" placeholder="browser-sync" value={ghRepo} onChange={e => setGhRepo(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="settings-gh-branch">Branch</label>
              <input id="settings-gh-branch" type="text" className="form-input" placeholder="main" value={ghBranch} onChange={e => setGhBranch(e.target.value)} />
            </div>
          </>
        )}

        <button
          id="settings-test-connection"
          className="btn btn-secondary btn-full"
          onClick={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? 'Testing…' : 'Test Connection'}
        </button>

        {connResult && (
          <div className={`conn-result ${connResult.ok ? 'success' : 'error'}`}>
            {connResult.msg}
          </div>
        )}
      </div>

      {/* Sync preferences */}
      <div className="settings-section">
        <div className="settings-section-title">Sync Preferences</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="settings-snap-count">Tab Snapshots</label>
            <select id="settings-snap-count" className="form-select" value={snapCount} onChange={e => setSnapCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 8, 10].map(n => (
                <option key={n} value={n}>{n} snapshots</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="settings-interval">Sync Interval</label>
            <select id="settings-interval" className="form-select" value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}>
              <option value={1}>Every 1 min</option>
              <option value={5}>Every 5 min</option>
              <option value={15}>Every 15 min</option>
              <option value={30}>Every 30 min</option>
              <option value={60}>Every hour</option>
            </select>
          </div>
        </div>
      </div>

      {/* Device */}
      <div className="settings-section">
        <div className="settings-section-title">This Device</div>
        <div className="form-group">
          <label className="form-label" htmlFor="settings-device-name">Device Name</label>
          <input
            id="settings-device-name"
            type="text"
            className="form-input"
            placeholder="My Device"
            value={deviceNameVal}
            onChange={e => setDeviceNameVal(e.target.value)}
          />
          <div className="form-hint">Shown to other devices when viewing your remote tabs.</div>
        </div>
      </div>

      {/* Save */}
      <button
        id="settings-save"
        className="btn btn-primary btn-full"
        onClick={handleSave}
        disabled={isSaving}
        style={{ marginBottom: '12px' }}
      >
        {isSaving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}
