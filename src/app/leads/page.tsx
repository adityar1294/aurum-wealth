'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import {
  Plus, UserPlus, ChevronRight, ArrowRight, Mail, Phone, Target, Edit2, CheckCircle, X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/hooks/useAuth';
import { getClientDb } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import type { LeadStage } from '@/lib/types';

interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  stage: LeadStage;
  notes?: string;
  lookingFor?: string;
  estimatedValue?: number;
  rmId: string;
  createdAt: Date;
  updatedAt: Date;
  convertedClientId?: string;
}

const FUNNEL: LeadStage[] = [
  'cold_lead', 'contacted', 'meeting_1', 'meeting_2',
  'interested', 'agreement_signed', 'fee_paid',
];

const OFF_FUNNEL: LeadStage[] = ['considering', 'not_interested', 'looking_elsewhere'];
const PIPELINE_STAGES: LeadStage[] = ['agreement_signed', 'fee_paid'];

const STAGE_LABEL: Record<LeadStage, string> = {
  cold_lead:        'Cold Lead',
  contacted:        'Contacted',
  meeting_1:        '1st Meeting Done',
  meeting_2:        '2nd Meeting Done',
  interested:       'Client Interested',
  agreement_signed: 'Agreement Signed',
  fee_paid:         'Onboarding Fee Paid',
  client:           'Became Client',
  considering:      'Needs Time to Consider',
  not_interested:   'Not Interested',
  looking_elsewhere:'Looking Elsewhere',
};

const STAGE_BADGE: Record<string, string> = {
  cold_lead:         'badge-pending',
  contacted:         'badge-upcoming',
  meeting_1:         'badge-upcoming',
  meeting_2:         'badge-upcoming',
  interested:        'badge-today',
  agreement_signed:  'badge-success',
  fee_paid:          'badge-success',
  client:            'badge-success',
  considering:       'badge-pending',
  not_interested:    'badge-overdue',
  looking_elsewhere: 'badge-pending',
};

const SOURCES = ['Referral', 'Cold Call', 'Social Media', 'Website', 'Event', 'Other'];

const cr = (v: number) =>
  v >= 1_00_00_000
    ? `₹${(v / 1_00_00_000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`
    : `₹${(v / 1_00_000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;

const toDate = (val: unknown) => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === 'object' && val && 'toDate' in val) return (val as { toDate: () => Date }).toDate();
  return new Date(val as string);
};

const BLANK_FORM = {
  name: '', email: '', phone: '', source: 'Referral',
  stage: 'cold_lead' as LeadStage, notes: '', lookingFor: '', estimatedValue: '',
};

export default function LeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all' | 'funnel' | 'off_funnel'>('all');
  const [modal, setModal] = useState<{ open: boolean; lead?: Lead }>({ open: false });
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const loadLeads = async () => {
    if (!user) return;
    const db = getClientDb();
    setLoading(true);
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'leads'))
        : query(collection(db, 'leads'), where('rmId', '==', user.uid));
      const snap = await getDocs(q);
      setLeads(snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: toDate(d.data().createdAt),
        updatedAt: toDate(d.data().updatedAt),
      })) as Lead[]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadLeads(); }, [user]);

  const openAdd = () => {
    setForm(BLANK_FORM);
    setModal({ open: true });
  };

  const openEdit = (lead: Lead) => {
    setForm({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || 'Referral',
      stage: lead.stage,
      notes: lead.notes || '',
      lookingFor: lead.lookingFor || '',
      estimatedValue: lead.estimatedValue ? String(lead.estimatedValue) : '',
    });
    setModal({ open: true, lead });
  };

  const closeModal = () => setModal({ open: false });

  const save = async () => {
    if (!form.name.trim() || !user) return;
    setSaving(true);
    const db = getClientDb();
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source,
      stage: form.stage,
      notes: form.notes.trim() || null,
      lookingFor: form.stage === 'looking_elsewhere' ? form.lookingFor.trim() || null : null,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      rmId: user.uid,
      updatedAt: new Date(),
    };

    try {
      if (modal.lead) {
        await updateDoc(doc(db, 'leads', modal.lead.id), payload);
        setLeads((prev) => prev.map((l) =>
          l.id === modal.lead!.id ? { ...l, ...payload, updatedAt: new Date() } as Lead : l
        ));
      } else {
        const ref = await addDoc(collection(db, 'leads'), { ...payload, createdAt: new Date() });
        setLeads((prev) => [
          ...prev,
          { id: ref.id, ...payload, createdAt: new Date() } as Lead,
        ]);
      }
      closeModal();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const advanceStage = async (lead: Lead) => {
    const idx = FUNNEL.indexOf(lead.stage);
    if (idx < 0 || idx >= FUNNEL.length - 1) return;
    const next = FUNNEL[idx + 1];
    const db = getClientDb();
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, stage: next } : l));
    try {
      await updateDoc(doc(db, 'leads', lead.id), { stage: next, updatedAt: new Date() });
    } catch {
      setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, stage: lead.stage } : l));
    }
  };

  const convertToClient = async (lead: Lead) => {
    if (!user) return;
    setConverting(lead.id);
    const db = getClientDb();
    try {
      const clientRef = await addDoc(collection(db, 'clients'), {
        rmId: user.uid,
        personalInfo: {
          firstName: lead.name.split(' ')[0] || lead.name,
          lastName: lead.name.split(' ').slice(1).join(' ') || '',
          email: lead.email || '',
          phone: lead.phone || '',
          dateOfBirth: '',
          pan: '',
          aadhaar: '',
          address: '',
        },
        riskProfile: 'moderate',
        taxSlab: '30%',
        financialGoals: '',
        investmentHorizon: '',
        notes: lead.notes || '',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await updateDoc(doc(db, 'leads', lead.id), {
        stage: 'client',
        convertedClientId: clientRef.id,
        updatedAt: new Date(),
      });
      setLeads((prev) => prev.map((l) =>
        l.id === lead.id ? { ...l, stage: 'client' as LeadStage, convertedClientId: clientRef.id } : l
      ));
      router.push(`/clients/${clientRef.id}`);
    } catch { /* ignore */ }
    setConverting(null);
  };

  // Metrics
  const totalLeads = leads.length;
  const activeFunnel = leads.filter((l) => FUNNEL.includes(l.stage)).length;
  const pipelineValue = leads
    .filter((l) => PIPELINE_STAGES.includes(l.stage))
    .reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const converted = leads.filter((l) => l.stage === 'client').length;

  const filtered = useMemo(() => {
    if (stageFilter === 'all') return leads;
    if (stageFilter === 'funnel') return leads.filter((l) => FUNNEL.includes(l.stage));
    if (stageFilter === 'off_funnel') return leads.filter((l) => OFF_FUNNEL.includes(l.stage));
    return leads.filter((l) => l.stage === stageFilter);
  }, [leads, stageFilter]);

  const stageCounts = useMemo(() => {
    const map: Partial<Record<LeadStage | 'all' | 'funnel' | 'off_funnel', number>> = { all: leads.length };
    leads.forEach((l) => {
      map[l.stage] = (map[l.stage] || 0) + 1;
      if (FUNNEL.includes(l.stage)) map.funnel = (map.funnel || 0) + 1;
      if (OFF_FUNNEL.includes(l.stage)) map.off_funnel = (map.off_funnel || 0) + 1;
    });
    return map;
  }, [leads]);

  return (
    <AppShell>
      <div className="page dashboard-page">

        {/* Hero */}
        <div className="dashboard-hero">
          <div>
            <div className="hero-date">pipeline management</div>
            <h1>Leads.</h1>
            <p>track every prospect from cold to client.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> Add lead
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="dashboard-metrics" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="metric-feature metric-aum">
            <span>Total Leads</span>
            <strong>{totalLeads}</strong>
            <em style={{ fontStyle: 'normal', fontSize: 13 }}>all stages</em>
          </div>
          <div className="metric-feature metric-clients">
            <span>Active Funnel</span>
            <strong>{activeFunnel}</strong>
            <em style={{ fontStyle: 'normal', fontSize: 13 }}>in progress</em>
          </div>
          <div className="metric-feature metric-pipeline">
            <span>Pipeline Value</span>
            <strong style={{ fontSize: pipelineValue > 0 ? 28 : 36 }}>
              {pipelineValue > 0 ? cr(pipelineValue) : '₹0'}
            </strong>
            <em style={{ fontStyle: 'normal', fontSize: 13 }}>signed + fee paid</em>
          </div>
          <div className="metric-feature metric-dark">
            <span>Converted</span>
            <strong>{converted}</strong>
            <em style={{ fontStyle: 'normal', fontSize: 13 }}>became clients</em>
          </div>
        </div>

        {/* Stage filter pills */}
        <div className="dashboard-panel" style={{ marginBottom: 20 }}>
          <div className="dashboard-card-head" style={{ marginBottom: 14 }}>
            <h2>Filter by stage</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {(['all', 'funnel'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStageFilter(f)}
                style={{
                  padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: stageFilter === f ? 'var(--ink)' : 'transparent',
                  borderColor: stageFilter === f ? 'var(--ink)' : 'var(--ink2)',
                  color: stageFilter === f ? 'var(--yolk)' : 'var(--ink)',
                }}
              >
                {f === 'all' ? 'All' : 'Active Funnel'} {stageCounts[f] ? `· ${stageCounts[f]}` : ''}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
            Funnel stages
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {FUNNEL.map((stage) => (
              <button
                key={stage}
                onClick={() => setStageFilter(stage)}
                style={{
                  padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: stageFilter === stage ? 'var(--ink)' : 'transparent',
                  borderColor: stageFilter === stage ? 'var(--ink)' : 'var(--ink2)',
                  color: stageFilter === stage ? 'var(--yolk)' : 'var(--ink)',
                }}
              >
                {STAGE_LABEL[stage]} {stageCounts[stage] ? `· ${stageCounts[stage]}` : ''}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
            Other
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {([...OFF_FUNNEL, 'client'] as LeadStage[]).map((stage) => (
              <button
                key={stage}
                onClick={() => setStageFilter(stage)}
                style={{
                  padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: stageFilter === stage ? 'var(--ink)' : 'transparent',
                  borderColor: stageFilter === stage ? 'var(--ink)' : 'var(--ink2)',
                  color: stageFilter === stage ? 'var(--yolk)' : 'var(--ink)',
                }}
              >
                {STAGE_LABEL[stage]} {stageCounts[stage] ? `· ${stageCounts[stage]}` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Lead list */}
        <div className="dashboard-panel">
          <div className="dashboard-card-head">
            <div className="flex-center gap-8">
              <h2>{stageFilter === 'all' ? 'All leads' : stageFilter === 'funnel' ? 'Active funnel' : stageFilter === 'off_funnel' ? 'Off-funnel' : STAGE_LABEL[stageFilter as LeadStage]}</h2>
              <span>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <UserPlus size={32} />
              <h3>No leads here yet</h3>
              <p>Click <strong>Add lead</strong> to start tracking your pipeline.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((lead) => {
                const funnelIdx = FUNNEL.indexOf(lead.stage);
                const inFunnel = funnelIdx >= 0;
                const canAdvance = inFunnel && funnelIdx < FUNNEL.length - 1;
                const canConvert = lead.stage === 'fee_paid';
                const isClient = lead.stage === 'client';

                return (
                  <div key={lead.id} style={{
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                  }}>

                    {/* Funnel progress dots */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 3 }}>
                      {FUNNEL.map((s, i) => (
                        <div key={s} style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: inFunnel && i <= funnelIdx
                            ? (i === funnelIdx ? 'var(--yolk)' : 'var(--ink)')
                            : 'var(--border)',
                          transition: 'background 0.2s',
                        }} title={STAGE_LABEL[s]} />
                      ))}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{lead.name}</h3>
                        <span className={`badge ${STAGE_BADGE[lead.stage] || 'badge-pending'}`}>
                          {STAGE_LABEL[lead.stage]}
                        </span>
                        {lead.estimatedValue ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>
                            <Target size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                            {cr(lead.estimatedValue)}
                          </span>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
                        {lead.email && (
                          <span style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={11} /> {lead.email}
                          </span>
                        )}
                        {lead.phone && (
                          <span style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={11} /> {lead.phone}
                          </span>
                        )}
                        {lead.source && (
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>via {lead.source}</span>
                        )}
                      </div>

                      {lead.notes && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                          {lead.notes.length > 100 ? `${lead.notes.slice(0, 100)}…` : lead.notes}
                        </p>
                      )}

                      {lead.stage === 'looking_elsewhere' && lead.lookingFor && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--accent-blue)', fontWeight: 500 }}>
                          Looking for: {lead.lookingFor}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => openEdit(lead)}
                      >
                        <Edit2 size={12} /> Edit
                      </button>

                      {canAdvance && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={() => advanceStage(lead)}
                        >
                          {STAGE_LABEL[FUNNEL[funnelIdx + 1]]} <ChevronRight size={12} />
                        </button>
                      )}

                      {canConvert && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '5px 12px', fontSize: 12, background: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}
                          onClick={() => convertToClient(lead)}
                          disabled={converting === lead.id}
                        >
                          {converting === lead.id ? <span className="spinner spinner-sm" /> : <><CheckCircle size={12} /> Convert to client</>}
                        </button>
                      )}

                      {isClient && lead.convertedClientId && (
                        <a
                          href={`/clients/${lead.convertedClientId}`}
                          className="btn btn-secondary"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                        >
                          View client <ArrowRight size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Add / Edit Modal */}
      {modal.open && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
            <div className="modal-head">
              <h2>{modal.lead ? 'Edit lead' : 'Add new lead'}</h2>
              <button className="dash-icon-button" onClick={closeModal}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Name *</label>
                <input
                  className="input"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    className="input"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Stage</label>
                  <select
                    className="input"
                    value={form.stage}
                    onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as LeadStage }))}
                  >
                    <optgroup label="Funnel">
                      {FUNNEL.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      {[...OFF_FUNNEL].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="form-label">Source</label>
                  <select
                    className="input"
                    value={form.source}
                    onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  >
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Estimated AUM (₹)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 50000000 for 5 Cr"
                  value={form.estimatedValue}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Any relevant background or context…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {form.stage === 'looking_elsewhere' && (
                <div>
                  <label className="form-label">What is the client looking for?</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Describe what product, service, or terms they are seeking…"
                    value={form.lookingFor}
                    onChange={(e) => setForm((f) => ({ ...f, lookingFor: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving || !form.name.trim()}
              >
                {saving ? <span className="spinner spinner-sm" /> : (modal.lead ? 'Save changes' : 'Add lead')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
