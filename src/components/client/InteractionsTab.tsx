'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit2, Trash2, Phone, Mail, Users, MessageCircle, Video, FileText } from 'lucide-react';
import { Interaction, InteractionType } from '@/lib/types';
import { decrypt, encrypt } from '@/lib/encryption';

const TYPES: InteractionType[] = ['call', 'meeting', 'email', 'whatsapp', 'review', 'other'];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={14} />,
  meeting: <Users size={14} />,
  email: <Mail size={14} />,
  whatsapp: <MessageCircle size={14} />,
  review: <FileText size={14} />,
  other: <Video size={14} />,
};

interface Props { clientId: string }

export default function InteractionsTab({ clientId }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [form, setForm] = useState({
    type: 'call' as InteractionType,
    subject: '', notes: '', date: new Date().toISOString().split('T')[0],
    followUpDate: '', followUpNote: '',
  });

  useEffect(() => { load(); }, [clientId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'interactions'), where('clientId', '==', clientId), orderBy('date', 'desc')));
      setItems(snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate?.() || new Date(d.data().date),
        followUpDate: d.data().followUpDate?.toDate?.() || (d.data().followUpDate ? new Date(d.data().followUpDate) : undefined),
        notes: decrypt(d.data().notes || ''),
        followUpNote: d.data().followUpNote || '',
      } as Interaction)));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ type: 'call', subject: '', notes: '', date: new Date().toISOString().split('T')[0], followUpDate: '', followUpNote: '' });
    setOpen(true);
  };

  const openEdit = (item: Interaction) => {
    setEditing(item);
    setForm({
      type: item.type,
      subject: item.subject,
      notes: item.notes,
      date: (item.date instanceof Date ? item.date : new Date(item.date as unknown as string)).toISOString().split('T')[0],
      followUpDate: item.followUpDate ? (item.followUpDate instanceof Date ? item.followUpDate : new Date(item.followUpDate as unknown as string)).toISOString().split('T')[0] : '',
      followUpNote: item.followUpNote || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const data = {
      clientId,
      rmId: user.uid,
      type: form.type,
      subject: form.subject,
      notes: encrypt(form.notes),
      date: new Date(form.date),
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

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg" /></div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Interactions</h2>
        <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Add Interaction</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state"><h3>No interactions yet</h3><p>Log your first interaction above</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex-between">
                <div className="flex-center gap-12">
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {TYPE_ICONS[item.type]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.subject}</div>
                    <div className="text-secondary" style={{ fontSize: 12 }}>
                      {item.type.toUpperCase()} · {(item.date instanceof Date ? item.date : new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-8">
                  <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                  <button className="btn-icon" onClick={() => remove(item.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              {item.notes && (
                <p style={{ marginTop: 10, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.notes}</p>
              )}
              {item.followUpDate && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--accent-gold-dim)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>Follow-up:</span>{' '}
                  {(item.followUpDate instanceof Date ? item.followUpDate : new Date()).toLocaleDateString('en-IN')}
                  {item.followUpNote && <span className="text-secondary"> — {item.followUpNote}</span>}
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
              <h2 className="modal-title">{editing ? 'Edit Interaction' : 'Add Interaction'}</h2>
              <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Type</label>
                <select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Subject *</label><input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} required /></div>
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
  );
}
