'use client';
import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  Plus, Edit2, Trash2, Search,
  Phone, Mail, Users, MessageCircle, FileText, Video,
  CalendarClock,
} from 'lucide-react';
import { Interaction, InteractionType } from '@/lib/types';
import { decrypt, encrypt } from '@/lib/encryption';
import Link from 'next/link';

const TYPES: InteractionType[] = ['call', 'meeting', 'email', 'whatsapp', 'review', 'other'];

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string; dim: string }> = {
  call:      { icon: <Phone size={14} />,         label: 'Call',      color: 'var(--accent-blue)',   dim: 'var(--accent-blue-dim)' },
  meeting:   { icon: <Users size={14} />,          label: 'Meeting',   color: 'var(--accent-green)',  dim: 'var(--accent-green-dim)' },
  email:     { icon: <Mail size={14} />,           label: 'Email',     color: 'var(--accent-purple)', dim: 'var(--accent-purple-dim)' },
  whatsapp:  { icon: <MessageCircle size={14} />,  label: 'WhatsApp',  color: 'var(--accent-green)',  dim: 'var(--accent-green-dim)' },
  review:    { icon: <FileText size={14} />,       label: 'Review',    color: 'var(--yolk-dk)',        dim: 'var(--accent-gold-dim)' },
  other:     { icon: <Video size={14} />,          label: 'Other',     color: 'var(--ink2)',           dim: 'rgba(22,20,15,0.07)' },
};

export default function InteractionsPage() {
  const { user } = useAuth();
  const [items, setItems]     = useState<(Interaction & { clientName?: string })[]>([]);
  const [filtered, setFiltered] = useState<typeof items>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [form, setForm]       = useState({
    type: 'call' as InteractionType,
    subject: '', notes: '',
    date: new Date().toISOString().split('T')[0],
    followUpDate: '', followUpNote: '', clientId: '',
  });

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    let result = items;
    if (typeFilter) result = result.filter((i) => i.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) => i.subject.toLowerCase().includes(q) || (i.clientName || '').toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [items, typeFilter, search]);

  const load = async () => {
    const db = getClientDb();
    if (!user) return;
    setLoading(true);
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'interactions'), orderBy('date', 'desc'))
        : query(collection(db, 'interactions'), where('rmId', '==', user.uid), orderBy('date', 'desc'));

      const [intSnap, clientSnap] = await Promise.all([
        getDocs(q),
        getDocs(
          user.role === 'admin'
            ? query(collection(db, 'clients'))
            : query(collection(db, 'clients'), where('rmId', '==', user.uid)),
        ),
      ]);

      const names: Record<string, string> = {};
      const clientList: { id: string; name: string }[] = [];
      clientSnap.docs.forEach((d) => {
        const pi = d.data().personalInfo || {};
        const name = `${pi.firstName || ''} ${pi.lastName || ''}`.trim();
        names[d.id] = name;
        clientList.push({ id: d.id, name });
      });
      setClientNames(names);
      setClients(clientList);

      setItems(intSnap.docs.map((d) => ({
        id: d.id, ...d.data(),
        date:        d.data().date?.toDate?.()        || new Date(d.data().date),
        followUpDate: d.data().followUpDate?.toDate?.(),
        notes:       decrypt(d.data().notes || ''),
        clientName:  names[d.data().clientId] || '',
      } as Interaction & { clientName?: string })));
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ type: 'call', subject: '', notes: '', date: new Date().toISOString().split('T')[0], followUpDate: '', followUpNote: '', clientId: '' });
    setOpen(true);
  };

  const openEdit = (item: Interaction) => {
    setEditing(item);
    setForm({
      type:        item.type,
      subject:     item.subject,
      notes:       item.notes,
      date:        (item.date instanceof Date ? item.date : new Date()).toISOString().split('T')[0],
      followUpDate: item.followUpDate
        ? (item.followUpDate instanceof Date ? item.followUpDate : new Date(item.followUpDate as unknown as string)).toISOString().split('T')[0]
        : '',
      followUpNote: item.followUpNote || '',
      clientId:    item.clientId,
    });
    setOpen(true);
  };

  const save = async () => {
    const db = getClientDb();
    if (!user) return;
    const data = {
      clientId: form.clientId, rmId: user.uid, type: form.type, subject: form.subject,
      notes: encrypt(form.notes), date: new Date(form.date),
      followUpDate: form.followUpDate ? new Date(form.followUpDate) : null,
      followUpNote: form.followUpNote || null,
    };
    if (editing) {
      await updateDoc(doc(db, 'interactions', editing.id), data);
    } else {
      await addDoc(collection(db, 'interactions'), { ...data, createdAt: serverTimestamp() });
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const db = getClientDb();
    if (!confirm('Delete this interaction?')) return;
    await deleteDoc(doc(db, 'interactions', id));
    load();
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // Type counts for summary
  const typeCounts = TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = items.filter((i) => i.type === t).length;
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="page dashboard-page">

        {/* ── Hero ── */}
        <div className="dashboard-hero">
          <div>
            <div className="hero-date">Client interactions</div>
            <h1>Interactions.</h1>
            <p>{items.length} touchpoints logged.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={16} /> Log Interaction
            </button>
          </div>
        </div>

        {/* ── Type filter pills ── */}
        <div className="dashboard-panel" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div className="flex flex-wrap gap-12" style={{ alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                placeholder="Search by subject or client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Icon pill filters */}
            <div className="flex gap-8 flex-wrap">
              {TYPES.map((t) => {
                const meta   = TYPE_META[t];
                const active = typeFilter === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(active ? '' : t)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 'var(--radius-pill)',
                      border: `1px solid ${active ? meta.color : 'rgba(22,20,15,0.10)'}`,
                      background: active ? meta.dim : 'rgba(255,255,255,0.70)',
                      color: active ? meta.color : 'var(--ink2)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all var(--transition)',
                    }}
                  >
                    {meta.icon}
                    {meta.label}
                    {typeCounts[t] > 0 && (
                      <span style={{
                        background: active ? meta.color : 'rgba(22,20,15,0.10)',
                        color: active ? '#fff' : 'var(--ink2)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '1px 6px', fontSize: 10, fontWeight: 700,
                      }}>
                        {typeCounts[t]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(search || typeFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setTypeFilter(''); }}>
                Clear · {filtered.length} shown
              </button>
            )}
          </div>
        </div>

        {/* ── Interaction cards ── */}
        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="dashboard-panel">
            <div className="empty-state">
              <h3>No interactions found</h3>
              <p>Log a call, meeting, or email to get started.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.other;
              const date = item.date instanceof Date ? item.date : new Date();
              const followUp = item.followUpDate instanceof Date
                ? item.followUpDate
                : item.followUpDate
                  ? new Date(item.followUpDate as unknown as string)
                  : null;

              return (
                <div key={item.id} className="dashboard-panel" style={{ padding: '16px 22px' }}>
                  <div className="flex-between">
                    <div className="flex-center gap-12">
                      {/* Type icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                        background: meta.dim, color: meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {meta.icon}
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.subject}</div>
                        <div className="flex-center gap-8" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: meta.dim, color: meta.color,
                            borderRadius: 'var(--radius-pill)', padding: '2px 9px',
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {meta.icon} {meta.label}
                          </span>
                          {item.clientId && (
                            <Link
                              href={`/clients/${item.clientId}`}
                              style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}
                            >
                              {item.clientName || item.clientId}
                            </Link>
                          )}
                          <span className="text-muted" style={{ fontSize: 12 }}>
                            {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-8">
                      <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                      <button className="btn-icon" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {item.notes && (
                    <p style={{
                      marginTop: 12, fontSize: 13, color: 'var(--text-secondary)',
                      lineHeight: 1.6, paddingLeft: 52,
                      borderLeft: `2px solid rgba(22,20,15,0.07)`,
                      marginLeft: 0,
                    }}>
                      {item.notes}
                    </p>
                  )}

                  {followUp && (
                    <div style={{ marginTop: 10, paddingLeft: 52 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 600,
                        background: 'var(--accent-gold-dim)', color: 'var(--yolk-dk)',
                        padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                      }}>
                        <CalendarClock size={12} />
                        Follow-up · {followUp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {item.followUpNote && ` — ${item.followUpNote}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal ── */}
        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editing ? 'Edit interaction' : 'Log interaction'}</h2>
                <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label className="label">Client</label>
                  <select className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
                    <option value="">No specific client</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
                    {TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Subject *</label>
                  <input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="What was discussed…" />
                </div>
                <div className="field">
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Notes</label>
                  <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Encrypted at rest…" />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="label">Follow-up date</label>
                    <input className="input" type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="label">Follow-up note</label>
                    <input className="input" value={form.followUpNote} onChange={(e) => set('followUpNote', e.target.value)} placeholder="Optional reminder…" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={!form.subject}>Save</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
