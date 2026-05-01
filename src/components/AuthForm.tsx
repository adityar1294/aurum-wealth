'use client';
import { useState, useRef, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Chrome } from 'lucide-react';

interface Props {
  accent?: 'blue' | 'green';
  redirectTo: string;
  title: string;
  subtitle: string;
}

type Mode = 'email' | 'phone';

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

export default function AuthForm({ accent = 'blue', redirectTo, title, subtitle }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const recaptchaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    const auth = getClientAuth();
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const auth = getClientAuth();
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    const auth = getClientAuth();
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaRef.current!, {
          size: 'invisible',
          callback: () => {},
        });
      }
      const phoneNumber = phone.length === 10 ? `+91${phone}` : phone;
      const result = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
      setConfirmResult(result);
      setOtpSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmResult) return;
    setError('');
    setLoading(true);
    try {
      await confirmResult.confirm(otp);
      router.replace(redirectTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const accentColor = accent === 'green' ? 'var(--accent-green)' : 'var(--accent-blue)';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ fontSize: 28, fontWeight: 800, background: `linear-gradient(135deg, var(--accent-gold), ${accentColor})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Aurum Wealth
          </div>
        </div>
        <h1 className="auth-title" style={{ textAlign: 'center' }}>{title}</h1>
        <p className="auth-subtitle" style={{ textAlign: 'center' }}>{subtitle}</p>

        <div style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 20 }}>
          <button
            className={`btn ${mode === 'email' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            style={{ flex: 1, ...(mode === 'email' && accent === 'green' ? { background: 'var(--accent-green)', borderColor: 'var(--accent-green)' } : {}) }}
            onClick={() => { setMode('email'); setError(''); }}
          >
            <Mail size={14} /> Email
          </button>
          <button
            className={`btn ${mode === 'phone' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            style={{ flex: 1, ...(mode === 'phone' && accent === 'green' ? { background: 'var(--accent-green)', borderColor: 'var(--accent-green)' } : {}) }}
            onClick={() => { setMode('phone'); setError(''); setOtpSent(false); }}
          >
            <Phone size={14} /> Phone OTP
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {mode === 'email' ? (
          <form className="auth-form" onSubmit={handleEmailLogin}>
            <div className="field">
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={accent === 'green' ? { background: 'var(--accent-green)', borderColor: 'var(--accent-green)' } : {}}
            >
              {loading ? <span className="spinner spinner-sm" /> : 'Sign In'}
            </button>
          </form>
        ) : !otpSent ? (
          <form className="auth-form" onSubmit={handleSendOtp}>
            <div className="field">
              <label className="label">Phone Number</label>
              <input
                className="input"
                type="tel"
                placeholder="10-digit or +91XXXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div ref={recaptchaRef} />
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={accent === 'green' ? { background: 'var(--accent-green)', borderColor: 'var(--accent-green)' } : {}}>
              {loading ? <span className="spinner spinner-sm" /> : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <div className="field">
              <label className="label">Enter OTP</label>
              <input className="input" type="text" placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={accent === 'green' ? { background: 'var(--accent-green)', borderColor: 'var(--accent-green)' } : {}}>
              {loading ? <span className="spinner spinner-sm" /> : 'Verify OTP'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOtpSent(false); setOtp(''); }}>
              Change Number
            </button>
          </form>
        )}

        <div className="auth-divider"><span>or</span></div>

        <button className="oauth-btn" onClick={handleGoogle} disabled={loading}>
          <Chrome size={18} color="#4285F4" />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
