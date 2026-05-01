'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Plus, Edit2, Trash2, CheckCircle, Filter } from 'lucide-react';
import { Task, TaskStatus, TaskPriority } from '@/lib/types';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filtered, setFiltered] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium' as TaskPriority,
    status: 'pending' as TaskStatus,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  });

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    let result = tasks;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    if (priorityFilter) result = result.filter((t) => t.priority === priorityFilter);
    setFiltered(result);
  }, [tasks, statusFilter, priorityFilter]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'tasks'))
        : query(collection(db, 'tasks'), where('rmId', '==', user.uid));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({
        id: d.id, ...d.data(),
        dueDate: d.data().dueDate?.toDate?.() || new Date(d.data().dueDate),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
      } as Task)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      setTasks(items);

      const clientIds = [...new Set(items.map((t) => t.clientId).filter(Boolean) as string[])];
      if (clientIds.length) {
        const names: Record<string, string> = {};
        await Promise.all(clientIds.map(async (cid) => {
          const cSnap = await getDocs(query(collection(db, 'clients'), where('__name__', '==', cid)));
          cSnap.docs.forEach((d) => {
            const pi = d.data().personalInfo || {};
            names[cid] = `${pi.firstName || ''} ${pi.lastName || ''}`.trim();
          });
        }));
        setClientNames(names);
      }
    } finally { setLoading(false); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', description: '', priority: 'medium', status: 'pending', dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({ title: t.title, description: t.description, priority: t.priority, status: t.status, dueDate: (t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate as unknown as string)).toISOString().split('T')[0] });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const data = { title: form.title, description: form.description, priority: form.priority, status: form.status, dueDate: new Date(form.dueDate), rmId: user.uid };
    if (editing) {
      const update: Record<string, unknown> = { ...data };
      if (form.status === 'completed' && editing.status !== 'completed') update.completedAt = new Date();
      await updateDoc(doc(db, 'tasks', editing.id), update);
    } else {
      await addDoc(collection(db, 'tasks'), { ...data, createdAt: serverTimestamp() });
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await deleteDoc(doc(db, 'tasks', id));
    load();
  };

  const quickComplete = async (t: Task) => {
    await updateDoc(doc(db, 'tasks', t.id), { status: 'completed', completedAt: new Date() });
    load();
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));
  const priorityBadge = (p: string) => ({ urgent: 'badge-red', high: 'badge-yellow', medium: 'badge-blue', low: 'badge-gray' }[p] || 'badge-gray');
  const statusBadge = (s: string) => ({ pending: 'badge-yellow', in_progress: 'badge-blue', completed: 'badge-green', cancelled: 'badge-gray' }[s] || 'badge-gray');
  const now = new Date();

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Task</button>
        </div>

        <div className="flex flex-wrap gap-12" style={{ marginBottom: 20 }}>
          <select className="select" style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select className="select" style={{ width: 160 }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Client</th><th>Priority</th><th>Status</th><th>Due Date</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><h3>No tasks found</h3></div></td></tr>
                ) : filtered.map((t) => {
                  const overdue = t.dueDate < now && t.status !== 'completed' && t.status !== 'cancelled';
                  return (
                    <tr key={t.id} className={overdue ? 'overdue' : ''}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        {t.description && <div className="text-secondary" style={{ fontSize: 12 }}>{t.description.slice(0, 60)}{t.description.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td className="text-secondary">{t.clientId ? (clientNames[t.clientId] || t.clientId) : '—'}</td>
                      <td><span className={`badge ${priorityBadge(t.priority)}`}>{t.priority}</span></td>
                      <td><span className={`badge ${statusBadge(t.status)}`}>{t.status.replace('_', ' ')}</span></td>
                      <td className={overdue ? 'text-red' : 'text-secondary'}>
                        {(t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate as unknown as string)).toLocaleDateString('en-IN')}
                        {overdue && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700 }}>OVERDUE</span>}
                      </td>
                      <td>
                        <div className="flex gap-8">
                          {t.status !== 'completed' && (
                            <button className="btn-icon" onClick={() => quickComplete(t)}><CheckCircle size={13} color="var(--accent-green)" /></button>
                          )}
                          <button className="btn-icon" onClick={() => openEdit(t)}><Edit2 size={13} /></button>
                          <button className="btn-icon" onClick={() => remove(t.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editing ? 'Edit Task' : 'Add Task'}</h2>
                <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field"><label className="label">Title *</label><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
                <div className="field"><label className="label">Description</label><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} /></div>
                <div className="form-grid">
                  <div className="field"><label className="label">Priority</label><select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                  <div className="field"><label className="label">Status</label><select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
                </div>
                <div className="field"><label className="label">Due Date</label><input className="input" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={!form.title}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
