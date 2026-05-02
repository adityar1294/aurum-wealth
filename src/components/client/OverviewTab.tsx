'use client';
import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { encrypt, decrypt } from '@/lib/encryption';
import { Eye, EyeOff, Edit2, Save, X } from 'lucide-react';
import { Client, RiskProfile, TaxSlab } from '@/lib/types';

interface Props {
  client: Client;
  onRefresh: () => void;
}

const RISK_PROFILES: RiskProfile[] = ['conservative', 'moderate', 'aggressive', 'very_aggressive'];
const TAX_SLABS: TaxSlab[] = ['0%', '5%', '10%', '15%', '20%', '25%', '30%'];
const HORIZONS = ['Short Term (< 3 yrs)', 'Medium Term (3–7 yrs)', 'Long Term (7–15 yrs)', 'Very Long Term (> 15 yrs)'];

const ENCRYPTED_FIELDS = ['phone', 'dateOfBirth', 'pan', 'aadhaar', 'address'];

export default function OverviewTab({ client, onRefresh }: Props) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: client.personalInfo.firstName,
    lastName: client.personalInfo.lastName,
    email: client.personalInfo.email,
    phone: decrypt(client.personalInfo.phone),
    dateOfBirth: decrypt(client.personalInfo.dateOfBirth),
    pan: decrypt(client.personalInfo.pan),
    aadhaar: decrypt(client.personalInfo.aadhaar),
    address: decrypt(client.personalInfo.address),
    riskProfile: client.riskProfile,
    taxSlab: client.taxSlab,
    financialGoals: decrypt(client.financialGoals),
    investmentHorizon: client.investmentHorizon,
    notes: decrypt(client.notes),
    tags: client.tags.join(', '),
  });

  const toggle = (field: string) => setRevealed((r) => ({ ...r, [field]: !r[field] }));

  const displayValue = (field: string, value: string) => {
    if (!ENCRYPTED_FIELDS.includes(field)) return value;
    if (revealed[field]) return decrypt(value) || '—';
    return '••••••••';
  };

  const handleSave = async () => {
    const db = getClientDb();
    setSaving(true);
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
      await updateDoc(doc(db, 'clients', client.id), {
        personalInfo,
        riskProfile: form.riskProfile,
        taxSlab: form.taxSlab,
        financialGoals: encrypt(form.financialGoals),
        investmentHorizon: form.investmentHorizon,
        notes: encrypt(form.notes),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const riskBadge = (r: string) => {
    const map: Record<string, string> = { conservative: 'badge-green', moderate: 'badge-blue', aggressive: 'badge-yellow', very_aggressive: 'badge-red' };
    return map[r] || 'badge-gray';
  };

  if (editing) {
    return (
      <div>
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Edit Client</h2>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}><X size={14} /> Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save</>}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Personal Information</h3>
          <div className="form-grid">
            <div className="field"><label className="label">First Name</label><input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div className="field"><label className="label">Last Name</label><input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
            <div className="field"><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="field"><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="field"><label className="label">Date of Birth</label><input className="input" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></div>
            <div className="field"><label className="label">PAN</label><input className="input" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></div>
            <div className="field"><label className="label">Aadhaar</label><input className="input" value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label className="label">Address</label><textarea className="textarea" value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} /></div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Investment Profile</h3>
          <div className="form-grid">
            <div className="field">
              <label className="label">Risk Profile</label>
              <select className="input" value={form.riskProfile} onChange={(e) => set('riskProfile', e.target.value)}>
                {RISK_PROFILES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Tax Slab</label>
              <select className="input" value={form.taxSlab} onChange={(e) => set('taxSlab', e.target.value)}>
                {TAX_SLABS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Investment Horizon</label>
              <select className="input" value={form.investmentHorizon} onChange={(e) => set('investmentHorizon', e.target.value)}>
                {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Tags</label>
              <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="HNI, NRI, Retiree…" />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label className="label">Financial Goals</label>
              <textarea className="textarea" value={form.financialGoals} onChange={(e) => set('financialGoals', e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label className="label">Notes</label>
              <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pi = client.personalInfo;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Client Overview</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}><Edit2 size={14} /> Edit</button>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Personal Information</h3>
          {[
            { label: 'Full Name', value: `${pi.firstName} ${pi.lastName}`, field: '' },
            { label: 'Email', value: pi.email, field: '' },
            { label: 'Phone', value: pi.phone, field: 'phone' },
            { label: 'Date of Birth', value: pi.dateOfBirth, field: 'dateOfBirth' },
            { label: 'PAN', value: pi.pan, field: 'pan' },
            { label: 'Aadhaar', value: pi.aadhaar, field: 'aadhaar' },
            { label: 'Address', value: pi.address, field: 'address' },
          ].map(({ label, value, field }) => (
            <div key={label} className="info-row">
              <span className="info-label">{label}</span>
              <span className="info-value">
                {field ? displayValue(field, value) : (value || '—')}
                {field && value && (
                  <button className="btn-icon" style={{ padding: 2, marginLeft: 6, background: 'none', border: 'none' }} onClick={() => toggle(field)}>
                    {revealed[field] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Investment Profile</h3>
            <div className="info-row">
              <span className="info-label">Risk Profile</span>
              <span className="info-value"><span className={`badge ${riskBadge(client.riskProfile)}`}>{client.riskProfile.replace('_', ' ')}</span></span>
            </div>
            <div className="info-row">
              <span className="info-label">Tax Slab</span>
              <span className="info-value">{client.taxSlab}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Horizon</span>
              <span className="info-value">{client.investmentHorizon}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Tags</span>
              <span className="info-value">
                <div className="flex flex-wrap gap-8">
                  {client.tags.length ? client.tags.map((t) => <span key={t} className="tag">{t}</span>) : '—'}
                </div>
              </span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Financial Goals</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {decrypt(client.financialGoals) || '—'}
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Notes</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {decrypt(client.notes) || '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
