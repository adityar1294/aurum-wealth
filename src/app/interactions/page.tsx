'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Plus, Edit2, Trash2, Search, Phone, Mail, Users, MessageCircle, FileText, Video } from 'lucide-react';
import { Interaction, InteractionType } from '@/lib/types';
import { decrypt, encrypt } from '@/lib/encryption';
import Link from 'next/link';

const TYPES: InteractionType[] = ['call', 'meeting', 'email', 'whatsapp', 'review', 'other'];
const TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={14} />, meeting: <Users size={14} />, email: <Mail size={14} />,
  whatsapp: <MessageCircle size={14} />, review: <FileText size={14} />, other: <Video size={14} />,
};

export default function InteractionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<(Interaction & { clientName?: string })[]>([]);
  const [filtered, setFiltered] = useState<typeof items>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [form, setForm] = useState({
    type: 'call' as InteractionType, subject: '', notes: '',
    date: new Date().toISOString().split('T')[0],
    followUpDate: '', followUpNote: '', clientId: '',
  });

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    let result = items;
    if (typeFilter) result = result.filter((i) => i.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.subject.toLowerCase().includes(q) || (i.clientName || '').toLowerCase().includes(q));
    }
    setFiltered(result);
  }, [items, typeFilter, search]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'interactions'), orderBy('date', 'desc'))
        : query(collection(db, 'interactions'), where('rmId', '==', user.uid), orderBy('date', 'desc'));

      const [intSnap, clientSnap] = await Promise.all([
        getDocs(q),
        getDocs(user.role === 'admin' ? query(collection(db, 'clients')) : query(collection(db, 'clients'), where('rmId', '==', user.uid))),
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
        date: d.data().date?.toDate?.() || new Date(d.data().date),
        followUpDate: d.data().followUpDate?.toDate?.(),
        notes: decrypt(d.data().notes || ''),
        clientName: names[d.data().clientId] || '',
      } as Interaction & { clientName?: string })));
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ type: 'call', subject: '', notes: '', date: new Date().toISOString().split('T')[0], followUpDate: '', followUpNote: '', clientId: '' });
    setOpen(true);
  };

  const openEdit = (item: Interaction) => {
    setEditing(item);
    setForm({
      type: item.type, subject: item.subject, notes: item.notes,
      date: (item.date instanceof Date ? item.date : new Date()).toISOString().split('T')[0],
      followUpDate: item.followUpDate ? (item.followUpDate instanceof Date ? item.followUpDate : new Date(item.followUpDate as unknown as string)).toISOString().split('T')[0] : '',
      followUpNote: item.followUpNote || '', clientId: item.clientId,
    });
    setOpen(true);
  };

  const save = async () => {
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
    if (!confirm('Delete this interaction?')) return;
    await deleteDoc(doc(db, 'interactions', id));
    load();
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Interactions</h1>
            <p className="page-subtitle">{filtered.length} interaction{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Log Interaction</button>
        </div>

        <div className="flex flex-wrap gap-12" style={{ marginBottom: 20 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} color="var(--text-muted)" />
            <input placeholder="Search by subject or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><h3>No interactions found</h3></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => (
              <div key={item.id} className="card" style={{ padding: '14px 20px' }}>
                <div className="flex-between">
                  <div className="flex-center gap-12">
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {TYPE_ICONS[item.type]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{item.subject}</div>
                      <div className="flex-center gap-8" style={{ marginTop: 2 }}>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>{item.type}</span>
                        {item.clientId && (
                          <Link href={`/clients/${item.clientId}`} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {item.clientName || item.clientId}
                          </Link>
                        )}
                        <span className="text-muted" style={{ fontSize: 12 }}>
                          {(item.date instanceof Date ? item.date : new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                  <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 46 }}>{item.notes}</p>
                )}
                {item.followUpDate && (
                  <div style={{ marginTop: 8, paddingLeft: 46 }}>
                    <span style={{ fontSize: 12, background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                      Follow-up: {(item.followUpDate instanceof Date ? item.followUpDate : new Date()).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editing ? 'Edit Interaction' : 'Log Interaction'}</h2>
                <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label className="label">Client</label>
                  <select className="select" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
                    <option value="">No specific client</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  <select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">Subject *</label><input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} /></div>
                <div className="field"><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
                <div className="field"><label className="label">Notes</label><textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} /></div>
                <div className="field"><label className="label">Follow-up Date</label><input className="input" type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} /></div>
                <div className="field"><label className="label">Follow-up Note</label><input className="input" value={form.followUpNote} onChange={(e) => set('followUpNote', e.target.value)} /></div>
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
