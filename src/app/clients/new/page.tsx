'use client';
import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { encrypt } from '@/lib/encryption';
import { RiskProfile, TaxSlab } from '@/lib/types';

const RISK_PROFILES: RiskProfile[] = ['conservative', 'moderate', 'aggressive', 'very_aggressive'];
const TAX_SLABS: TaxSlab[] = ['0%', '5%', '10%', '15%', '20%', '25%', '30%'];
const HORIZONS = ['Short Term (< 3 yrs)', 'Medium Term (3–7 yrs)', 'Long Term (7–15 yrs)', 'Very Long Term (> 15 yrs)'];

export default function NewClientPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    dateOfBirth: '', pan: '', aadhaar: '', address: '',
    riskProfile: 'moderate' as RiskProfile,
    taxSlab: '30%' as TaxSlab,
    financialGoals: '',
    investmentHorizon: HORIZONS[1],
    notes: '',
    tags: '',
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const personalInfo = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: encrypt(form.phone),
        dateOfBirth: encrypt(form.dateOfBirth),
        pan: encrypt(form.pan),
        aadhaar: encrypt(form.aadhaar),
        address: encrypt(form.address),
      };

      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

      const ref = await addDoc(collection(db, 'clients'), {
        rmId: user.uid,
        personalInfo,
        riskProfile: form.riskProfile,
        taxSlab: form.taxSlab,
        financialGoals: encrypt(form.financialGoals),
        investmentHorizon: form.investmentHorizon,
        notes: encrypt(form.notes),
        tags,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace(`/clients/${ref.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="page" style={{ maxWidth: 800 }}>
        <div className="page-header">
          <div className="flex-center gap-12">
            <Link href="/clients" className="btn btn-icon">
              <ChevronLeft size={16} />
            </Link>
            <div>
              <h1 className="page-title">New Client</h1>
              <p className="page-subtitle">Fill in the client details below</p>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: 20 }}>Personal Information</h2>
            <div className="form-grid">
              <div className="field">
                <label className="label">First Name *</label>
                <input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Last Name *</label>
                <input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Email *</label>
                <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Phone</label>
                <input className="input" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit number" />
              </div>
              <div className="field">
                <label className="label">Date of Birth</label>
                <input className="input" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">PAN</label>
                <input className="input" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
              </div>
              <div className="field">
                <label className="label">Aadhaar</label>
                <input className="input" value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value)} placeholder="12-digit number" maxLength={12} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Address</label>
                <textarea className="textarea" value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div className="card mt-16">
            <h2 className="card-title" style={{ marginBottom: 20 }}>Financial Profile</h2>
            <div className="form-grid">
              <div className="field">
                <label className="label">Risk Profile *</label>
                <select className="select" value={form.riskProfile} onChange={(e) => set('riskProfile', e.target.value)}>
                  {RISK_PROFILES.map((r) => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Tax Slab</label>
                <select className="select" value={form.taxSlab} onChange={(e) => set('taxSlab', e.target.value)}>
                  {TAX_SLABS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Investment Horizon</label>
                <select className="select" value={form.investmentHorizon} onChange={(e) => set('investmentHorizon', e.target.value)}>
                  {HORIZONS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Tags (comma-separated)</label>
                <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="HNI, NRI, Retiree…" />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Financial Goals</label>
                <textarea className="textarea" value={form.financialGoals} onChange={(e) => set('financialGoals', e.target.value)} placeholder="Retirement planning, child education, wealth creation…" />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Notes</label>
                <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes about the client…" />
              </div>
            </div>
          </div>

          <div className="flex-between mt-24">
            <Link href="/clients" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
