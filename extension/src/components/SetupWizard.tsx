import React, { useState } from 'react';
import type { SyncSettings, AdapterCredentials } from '../lib/adapters/interface';
import { saveSettings } from '../lib/adapters/factory';
import { deriveKey } from '../lib/crypto';

interface SetupWizardProps {
  onComplete: (settings: SyncSettings) => void;
}

type Step = 'welcome' | 'backend' | 'passphrase' | 'done';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [backend, setBackend] = useState<'webdav' | 'github'>('webdav');
  const [connResult, setConnResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // WebDAV
  const [wdUrl, setWdUrl] = useState('');
  const [wdUser, setWdUser] = useState('');
  const [wdPass, setWdPass] = useState('');

  // GitHub
  const [ghToken, setGhToken] = useState('');
  const [ghOwner, setGhOwner] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');

  // Passphrase
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [passphraseError, setPassphraseError] = useState('');

  const steps: Step[] = ['welcome', 'backend', 'passphrase', 'done'];
  const stepIndex = steps.indexOf(step);

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
      setConnResult({
        ok: response.success,
        msg: response.success ? 'Connection successful! ✓' : (response.error ?? 'Connection failed'),
      });
    } catch (err) {
      setConnResult({ ok: false, msg: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFinish = async () => {
    if (passphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters.');
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setPassphraseError('Passphrases do not match.');
      return;
    }
    setPassphraseError('');
    setIsFinishing(true);

    try {
      const creds = buildCredentials();
      // Generate and store salt
      const { salt } = await deriveKey(passphrase);

      const newSettings: SyncSettings = {
        credentials: creds,
        encryptionSalt: salt,
        tabSnapshotCount: 4,
        historySyncEnabled: false,
        syncIntervalMinutes: 5,
      };
      await saveSettings(newSettings);

      // Store passphrase in session
      await chrome.runtime.sendMessage({ type: 'SET_PASSPHRASE', payload: { passphrase } });

      setStep('done');
      onComplete(newSettings);
    } catch (err) {
      setPassphraseError(`Setup failed: ${err}`);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="wizard-wrap">
      {/* Step dots */}
      <div className="wizard-step-indicator">
        {steps.slice(0, -1).map((s, i) => (
          <React.Fragment key={s}>
            <div className={`wizard-step-dot${stepIndex === i ? ' active' : stepIndex > i ? ' done' : ''}`} />
            {i < steps.length - 2 && <div className="wizard-step-line" />}
          </React.Fragment>
        ))}
      </div>

      <div className="wizard-body">
        {step === 'welcome' && (
          <div>
            <div className="wizard-title">Welcome to Sync Freedom</div>
            <div className="wizard-subtitle">
              Sync your browser tabs and history across all your devices — using storage you own.
              No accounts. No servers. End-to-end encrypted.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { icon: '🔐', title: 'End-to-end encrypted', desc: 'Your passphrase never leaves your device.' },
                { icon: '📁', title: 'Your storage, your rules', desc: 'WebDAV, GitHub, or more — you choose.' },
                { icon: '📱', title: 'Desktop + mobile', desc: 'Works on Kiwi, Quetta, Edge, and all Chromium browsers.' },
                { icon: '🕐', title: 'Tab history', desc: 'Keep the last N snapshots of your open tabs.' },
              ].map(f => (
                <div key={f.title} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>{f.title}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'backend' && (
          <div>
            <div className="wizard-title">Choose Storage</div>
            <div className="wizard-subtitle">
              Where should your encrypted data be stored? You can change this later in Settings.
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {[
                  { value: 'webdav', label: 'WebDAV', desc: 'Nextcloud, pCloud, Koofr, Synology NAS…', icon: '🗄️' },
                  { value: 'github', label: 'GitHub', desc: 'Store in a private GitHub repository', icon: '🐙' },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setBackend(opt.value as 'webdav' | 'github')}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: backend === opt.value ? 'var(--accent-dim)' : 'var(--bg-card)',
                      border: `1px solid ${backend === opt.value ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>{opt.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{opt.desc}</div>
                    </div>
                    {backend === opt.value && (
                      <div style={{ marginLeft: 'auto', color: 'var(--accent-hover)', alignSelf: 'center' }}>✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {backend === 'webdav' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="wizard-wd-url">WebDAV URL</label>
                  <input id="wizard-wd-url" type="url" className="form-input" placeholder="https://nextcloud.example.com/remote.php/dav/files/user/" value={wdUrl} onChange={e => setWdUrl(e.target.value)} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wizard-wd-user">Username</label>
                    <input id="wizard-wd-user" type="text" className="form-input" placeholder="user" value={wdUser} onChange={e => setWdUser(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="wizard-wd-pass">Password</label>
                    <input id="wizard-wd-pass" type="password" className="form-input" placeholder="••••••••" value={wdPass} onChange={e => setWdPass(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {backend === 'github' && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="wizard-gh-token">Personal Access Token</label>
                  <input id="wizard-gh-token" type="password" className="form-input" placeholder="ghp_xxxxxxxxxxxx" value={ghToken} onChange={e => setGhToken(e.target.value)} />
                  <div className="form-hint">GitHub → Settings → Developer settings → Fine-grained tokens. Needs "Contents: read+write" on a private repo.</div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="wizard-gh-owner">Owner</label>
                    <input id="wizard-gh-owner" type="text" className="form-input" placeholder="username" value={ghOwner} onChange={e => setGhOwner(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="wizard-gh-repo">Repository</label>
                    <input id="wizard-gh-repo" type="text" className="form-input" placeholder="sync-data" value={ghRepo} onChange={e => setGhRepo(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <button
              id="wizard-test-connection"
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
        )}

        {step === 'passphrase' && (
          <div>
            <div className="wizard-title">Set Encryption Key</div>
            <div className="wizard-subtitle">
              Choose a strong passphrase. Your data is encrypted with AES-256-GCM before it leaves your device.
              This passphrase is <strong>never stored</strong> — if you forget it, your data cannot be recovered.
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="wizard-passphrase">Passphrase</label>
              <input
                id="wizard-passphrase"
                type="password"
                className="form-input"
                placeholder="At least 8 characters"
                value={passphrase}
                onChange={e => { setPassphrase(e.target.value); setPassphraseError(''); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="wizard-passphrase-confirm">Confirm Passphrase</label>
              <input
                id="wizard-passphrase-confirm"
                type="password"
                className="form-input"
                placeholder="Repeat passphrase"
                value={passphraseConfirm}
                onChange={e => { setPassphraseConfirm(e.target.value); setPassphraseError(''); }}
              />
            </div>

            {passphraseError && (
              <div className="conn-result error">{passphraseError}</div>
            )}

            <div style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--warn-bg)',
              border: '1px solid rgba(245,158,11,0.3)',
              fontSize: '11px',
              color: 'var(--warn)',
              lineHeight: 1.5,
              marginTop: '8px',
            }}>
              ⚠️ Write this passphrase down somewhere safe. It cannot be recovered if lost.
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
            <div className="wizard-title" style={{ textAlign: 'center' }}>You're all set!</div>
            <div className="wizard-subtitle" style={{ textAlign: 'center' }}>
              Sync Freedom is syncing your tabs. Install it on your other devices to see them appear here.
            </div>
          </div>
        )}
      </div>

      <div className="wizard-footer">
        {step !== 'welcome' && step !== 'done' && (
          <button
            className="btn btn-secondary"
            onClick={() => setStep(steps[stepIndex - 1])}
            style={{ flex: 1 }}
          >
            Back
          </button>
        )}
        {step !== 'done' && step !== 'passphrase' && (
          <button
            id="wizard-next"
            className="btn btn-primary"
            onClick={() => setStep(steps[stepIndex + 1])}
            style={{ flex: 2 }}
          >
            {step === 'welcome' ? 'Get Started →' : 'Next →'}
          </button>
        )}
        {step === 'passphrase' && (
          <button
            id="wizard-finish"
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={isFinishing}
            style={{ flex: 2 }}
          >
            {isFinishing ? 'Setting up…' : 'Finish Setup →'}
          </button>
        )}
      </div>
    </div>
  );
}
