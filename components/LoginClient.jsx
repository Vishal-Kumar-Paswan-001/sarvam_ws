'use client';

import { useState } from 'react';

export default function LoginClient() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [cls, setCls] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setStatus('');
    setCls('');
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setStatus('Signed in. Redirecting…');
        setCls('ok');
        window.location.href = '/share';
      } else {
        const d = await res.json().catch(() => ({}));
        setStatus(d.error || 'Login failed.');
        setCls('err');
      }
    } catch (_) {
      setStatus('Network error.');
      setCls('err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>SafeScreen</h1>
      <p className="sub">Read-only screen mirroring, document reader and voice. Sign in to continue.</p>
      <form onSubmit={submit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className={`status ${cls}`} role="status">{status}</div>
    </main>
  );
}
