'use client';
import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Plus, Edit2, Trash2, CheckCircle, Circle, ArrowUpRight } from 'lucide-react';
import { Task, TaskStatus, TaskPriority } from '@/lib/types';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const STATUSES: TaskStatus[]     = ['pending', 'in_progress', 'completed', 'cancelled'];

const PRIORITY_META: Record<string, { badge: string; label: string }> = {
  urgent: { badge: 'badge-red',    label: 'Urgent' },
  high:   { badge: 'badge-yellow', label: 'High' },
  medium: { badge: 'badge-blue',   label: 'Medium' },
  low:    { badge: 'badge-gray',   label: 'Low' },
};

const STATUS_META: Record<string, { badge: string; label: string }> = {
  pending:     { badge: 'badge-yellow', label: 'Pending' },
  in_progress: { badge: 'badge-blue',   label: 'In progress' },
  completed:   { badge: 'badge-green',  label: 'Completed' },
  cancelled:   { badge: 'badge-gray',   label: 'Cancelled' },
};

const relativeDate = (date: Date) => {
  const now  = new Date();
  const diff = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1)    return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks]                   = useState<Task[]>([]);
  const [filtered, setFiltered]             = useState<Task[]>([]);
  const [loading, setLoading]               = useState(true);
  const [statusFilter, setStatusFilter]     = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [clientNames, setClientNames]       = useState<Record<string, string>>({});
  const [open, setOpen]                     = useState(false);
  const [editing, setEditing]               = useState<Task | null>(null);
  const [viewing, setViewing]               = useState<Task | null>(null);
  const [form, setForm]                     = useState({
    title: '', description: '',
    priority: 'medium' as TaskPriority,
    status:   'pending' as TaskStatus,
    dueDate:  new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  });

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    let result = tasks;
    if (statusFilter)   result = result.filter((t) => t.status === statusFilter);
    if (priorityFilter) result = result.filter((t) => t.priority === priorityFilter);
    setFiltered(result);
  }, [tasks, statusFilter, priorityFilter]);

  const load = async () => {
    const db = getClientDb();
    if (!user) return;
    setLoading(true);
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'tasks'))
        : query(collection(db, 'tasks'), where('rmId', '==', user.uid));
      const snap = await getDocs(q);
      const items = snap.docs
        .map((d) => ({
          id: d.id, ...d.data(),
          dueDate:   d.data().dueDate?.toDate?.()   || new Date(d.data().dueDate),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          completedAt: d.data().completedAt?.toDate?.() || undefined,
        } as Task))
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
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
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      title: '', description: '', priority: 'medium', status: 'pending',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title, description: t.description, priority: t.priority, status: t.status,
      dueDate: (t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate as unknown as string))
        .toISOString().split('T')[0],
    });
    setViewing(null);
    setOpen(true);
  };

  const save = async () => {
    const db = getClientDb();
    if (!user) return;
    const data = {
      title: form.title, description: form.description,
      priority: form.priority, status: form.status,
      dueDate: new Date(form.dueDate), rmId: user.uid,
    };
    if (editing) {
      const update: Record<string, unknown> = { ...data };
      if (form.status === 'completed' && editing.status !== 'completed') {
        update.completedAt = new Date();
        window.dispatchEvent(new Event('aurum:xp-updated'));
      }
      await updateDoc(doc(db, 'tasks', editing.id), update);
    } else {
      await addDoc(collection(db, 'tasks'), { ...data, createdAt: serverTimestamp() });
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const db = getClientDb();
    if (!confirm('Delete this task?')) return;
    await deleteDoc(doc(db, 'tasks', id));
    load();
  };

  const quickComplete = async (t: Task) => {
    const db = getClientDb();
    // Optimistic update
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: 'completed' as TaskStatus } : x));
    if (viewing?.id === t.id) setViewing((v) => v ? { ...v, status: 'completed' as TaskStatus } : v);
    window.dispatchEvent(new Event('aurum:xp-updated'));
    try {
      await updateDoc(doc(db, 'tasks', t.id), { status: 'completed', completedAt: new Date() });
    } catch {
      load(); // Rollback via reload on error
    }
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const now       = new Date();
  const pending   = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  const overdue   = pending.filter((t) => t.dueDate < now);
  const dueToday  = pending.filter((t) => t.dueDate.toDateString() === now.toDateString());
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <AppShell>
      <div className="page dashboard-page">

        {/* ── Hero ── */}
        <div className="dashboard-hero">
          <div>
            <div className="hero-date">Task management</div>
            <h1>Tasks.</h1>
            <p>track, complete, earn XP.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={16} /> Add Task
            </button>
          </div>
        </div>

        {/* ── Summary metric cards ── */}
        {!loading && (
          <div className="dashboard-metrics" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
            <div
              className="metric-feature"
              style={{ background: 'linear-gradient(145deg, #fbe69a, #fff5cc)', cursor: 'pointer' }}
              onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
            >
              <span>Total tasks</span>
              <strong style={{ fontSize: 48 }}>{tasks.length}</strong>
              <small>{filtered.length} shown</small>
            </div>
            <div
              className="metric-feature"
              style={{ background: 'linear-gradient(145deg, #f3b7b4, #fde0df)', cursor: 'pointer' }}
              onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')}
            >
              <span>Pending</span>
              <strong style={{ fontSize: 48 }}>{pending.length}</strong>
              <small style={{ color: overdue.length ? 'var(--accent-red)' : 'inherit' }}>
                {overdue.length} overdue
              </small>
            </div>
            <div
              className="metric-feature metric-dark"
              style={{ cursor: 'pointer' }}
              onClick={() => setStatusFilter(statusFilter === 'in_progress' ? '' : 'in_progress')}
            >
              <span>Due today</span>
              <strong style={{ fontSize: 48 }}>{dueToday.length}</strong>
              <small>{overdue.length} past due</small>
              <div className="mini-bars">
                {[1,2,3,4,5,6,7].map((n) => (
                  <i key={n} className={n <= Math.min(7, dueToday.length) ? 'on' : ''} />
                ))}
              </div>
            </div>
            <div
              className="metric-feature metric-pipeline"
              style={{ cursor: 'pointer' }}
              onClick={() => setStatusFilter(statusFilter === 'completed' ? '' : 'completed')}
            >
              <span>Completed</span>
              <strong style={{ fontSize: 48 }}>{completed.length}</strong>
              <small>+{completed.length * 10} XP earned</small>
            </div>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="dashboard-panel" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div className="flex flex-wrap gap-12">
            <select
              className="input"
              style={{ width: 180 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <select
              className="input"
              style={{ width: 180 }}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>
            {(statusFilter || priorityFilter) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
              >
                Clear · {filtered.length} shown
              </button>
            )}
            <p style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)', alignSelf: 'center' }}>
              Click a row to complete · click the title to view details
            </p>
          </div>
        </div>

        {/* ── Task list ── */}
        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <div className="dashboard-panel" style={{ padding: 0 }}>
            <div
              className="table-wrap"
              style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'none', border: 'none', background: 'transparent' }}
            >
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th>Task</th>
                    <th>Client</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <h3>No tasks found</h3>
                          <p>Add a task or adjust your filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((t) => {
                    const isOverdue = t.dueDate < now && t.status !== 'completed' && t.status !== 'cancelled';
                    const isDone    = t.status === 'completed';
                    return (
                      <tr
                        key={t.id}
                        className={isOverdue ? 'overdue' : ''}
                        style={{ cursor: isDone ? 'default' : 'pointer' }}
                        title={isDone ? undefined : 'Click to mark complete'}
                        onClick={() => { if (!isDone) quickComplete(t); }}
                      >
                        {/* Status icon */}
                        <td onClick={(e) => e.stopPropagation()}>
                          {isDone
                            ? <CheckCircle size={16} color="var(--accent-green)" />
                            : <Circle size={16} color="var(--ink3)" />}
                        </td>

                        {/* Title — click opens detail view */}
                        <td onClick={(e) => { e.stopPropagation(); setViewing(t); }} style={{ cursor: 'pointer' }}>
                          <div style={{ fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.title}
                            <ArrowUpRight size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                          </div>
                          {t.description && (
                            <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                              {t.description.slice(0, 70)}{t.description.length > 70 ? '…' : ''}
                            </div>
                          )}
                        </td>

                        <td className="text-secondary" onClick={(e) => e.stopPropagation()}>
                          {t.clientId ? (clientNames[t.clientId] || '—') : '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className={`badge ${PRIORITY_META[t.priority]?.badge || 'badge-gray'}`}>
                            {PRIORITY_META[t.priority]?.label || t.priority}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className={`badge ${STATUS_META[t.status]?.badge || 'badge-gray'}`}>
                            {STATUS_META[t.status]?.label || t.status}
                          </span>
                        </td>
                        <td className={isOverdue ? 'text-red' : 'text-secondary'} onClick={(e) => e.stopPropagation()}>
                          {(t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate as unknown as string))
                            .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {isOverdue && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                              OVERDUE
                            </span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-8">
                            {!isDone && (
                              <button className="btn-icon" title="Mark complete" onClick={() => quickComplete(t)}>
                                <CheckCircle size={13} color="var(--accent-green)" />
                              </button>
                            )}
                            <button className="btn-icon" onClick={() => openEdit(t)}>
                              <Edit2 size={13} />
                            </button>
                            <button className="btn-icon" onClick={() => remove(t.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Task detail modal ── */}
        {viewing && (
          <div className="modal-overlay" onClick={() => setViewing(null)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div style={{ flex: 1 }}>
                  <div className="flex-center gap-8" style={{ marginBottom: 8 }}>
                    <span className={`badge ${PRIORITY_META[viewing.priority]?.badge || 'badge-gray'}`}>
                      {PRIORITY_META[viewing.priority]?.label}
                    </span>
                    <span className={`badge ${STATUS_META[viewing.status]?.badge || 'badge-gray'}`}>
                      {STATUS_META[viewing.status]?.label}
                    </span>
                    {viewing.dueDate < now && viewing.status !== 'completed' && viewing.status !== 'cancelled' && (
                      <span className="badge badge-red">Overdue</span>
                    )}
                  </div>
                  <h2 className="modal-title">{viewing.title}</h2>
                </div>
                <button className="btn-icon" onClick={() => setViewing(null)}>×</button>
              </div>

              <div className="modal-body">
                {viewing.description && (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, padding: '12px 16px', background: 'rgba(255,255,255,0.60)', borderRadius: 'var(--radius-md)' }}>
                    {viewing.description}
                  </p>
                )}

                <div>
                  <div className="info-row">
                    <span className="info-label">Due date</span>
                    <span className="info-value">
                      {(viewing.dueDate instanceof Date ? viewing.dueDate : new Date(viewing.dueDate as unknown as string))
                        .toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                        ({relativeDate(viewing.dueDate instanceof Date ? viewing.dueDate : new Date(viewing.dueDate as unknown as string))})
                      </span>
                    </span>
                  </div>
                  {viewing.clientId && (
                    <div className="info-row">
                      <span className="info-label">Client</span>
                      <span className="info-value">{clientNames[viewing.clientId] || viewing.clientId}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="info-label">Created</span>
                    <span className="info-value">
                      {(viewing.createdAt instanceof Date ? viewing.createdAt : new Date())
                        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {viewing.status === 'completed' && (viewing as Task & { completedAt?: Date }).completedAt && (
                    <div className="info-row">
                      <span className="info-label">Completed</span>
                      <span className="info-value" style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                        {((viewing as Task & { completedAt?: Date }).completedAt as Date)
                          .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        &nbsp;· +10 XP
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => openEdit(viewing)}>
                  <Edit2 size={13} /> Edit
                </button>
                {viewing.status !== 'completed' && viewing.status !== 'cancelled' && (
                  <button className="btn btn-green" onClick={() => quickComplete(viewing)}>
                    <CheckCircle size={14} /> Mark complete
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add / edit modal ── */}
        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editing ? 'Edit task' : 'Add task'}</h2>
                <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label className="label">Title *</label>
                  <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Task title…" />
                </div>
                <div className="field">
                  <label className="label">Description</label>
                  <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Optional details…" />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="label">Priority</label>
                    <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="label">Due date</label>
                  <input className="input" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={!form.title}>Save task</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
