'use client';
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetup = async (e: React.FormEvent) => {
    const auth = getClientAuth();
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();

      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Setup failed');
      }

      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: 28, fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Aurum Wealth
          </div>
        </div>
        <h1 className="auth-title" style={{ textAlign: 'center' }}>Initial Setup</h1>
        <p className="auth-subtitle" style={{ textAlign: 'center' }}>Create the admin account to get started</p>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 16, marginBottom: 8 }}>
            {error}
          </div>
        )}

        <form className="auth-form" style={{ marginTop: 24 }} onSubmit={handleSetup}>
          <div className="field">
            <label className="label">Full Name</label>
            <input className="input" type="text" placeholder="Admin Name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
