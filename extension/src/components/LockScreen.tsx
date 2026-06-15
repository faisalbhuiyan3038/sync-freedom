import React, { useState } from 'react';

interface LockScreenProps {
  onUnlock: (passphrase: string) => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError('Please enter your encryption passphrase.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onUnlock(passphrase);
    } catch (err) {
      setError('Failed to unlock. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-icon">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
        </svg>
      </div>
      <div className="lock-title">Enter Passphrase</div>
      <div className="lock-desc">
        Your data is encrypted. Enter your passphrase to unlock Sync Freedom for this session.
      </div>
      <form className="lock-form" onSubmit={handleSubmit}>
        <input
          id="lock-passphrase"
          type="password"
          className="form-input"
          placeholder="Encryption passphrase"
          value={passphrase}
          onChange={e => { setPassphrase(e.target.value); setError(''); }}
          autoFocus
        />
        {error && (
          <div className="conn-result error">{error}</div>
        )}
        <button
          id="lock-submit"
          type="submit"
          className="btn btn-primary btn-full"
          disabled={isLoading}
        >
          {isLoading ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
      <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
        Your passphrase is never stored or transmitted. It's only used to derive your encryption key.
      </p>
    </div>
  );
}
