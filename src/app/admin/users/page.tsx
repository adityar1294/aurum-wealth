'use client';
import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getClientDb, getClientAuth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Plus, Edit2, Trash2, Shield, User, Users } from 'lucide-react';
import { User as UserType, Role } from '@/lib/types';

const ROLES: Role[] = ['admin', 'rm', 'client'];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'rm' as Role });

  useEffect(() => { if (user?.role === 'admin') load(); }, [user]);

  const load = async () => {
    const db = getClientDb();
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date() } as UserType)));
    } finally { setLoading(false); }
  };

  const create = async () => {
    const db = getClientDb();
    const auth = getClientAuth();
    setError('');
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid, email: form.email, name: form.name, role: form.role, createdAt: serverTimestamp(),
      });
      setOpen(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (uid: string, role: Role) => {
    const db = getClientDb();
    await updateDoc(doc(db, 'users', uid), { role });
    load();
  };

  const remove = async (uid: string) => {
    const db = getClientDb();
    if (!confirm('Remove this user?')) return;
    await deleteDoc(doc(db, 'users', uid));
    load();
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const stats = {
    admin: users.filter((u) => u.role === 'admin').length,
    rm: users.filter((u) => u.role === 'rm').length,
    client: users.filter((u) => u.role === 'client').length,
  };

  const roleBadge = (r: string) => ({ admin: 'badge-red', rm: 'badge-blue', client: 'badge-green' }[r] || 'badge-gray');

  return (
    <AppShell requireRole="admin">
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">User Management</h1>
            <p className="page-subtitle">{users.length} total users</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', email: '', password: '', role: 'rm' }); setError(''); setOpen(true); }}>
            <Plus size={16} /> Create User
          </button>
        </div>

        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="metric-card">
            <div className="metric-icon" style={{ background: 'var(--accent-red-dim)' }}><Shield size={18} color="var(--accent-red)" /></div>
            <div className="metric-label">Admins</div>
            <div className="metric-value">{stats.admin}</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon" style={{ background: 'var(--accent-blue-dim)' }}><User size={18} color="var(--accent-blue)" /></div>
            <div className="metric-label">Relationship Managers</div>
            <div className="metric-value">{stats.rm}</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon" style={{ background: 'var(--accent-green-dim)' }}><Users size={18} color="var(--accent-green)" /></div>
            <div className="metric-label">Clients</div>
            <div className="metric-value">{stats.client}</div>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <div className="flex-center gap-8">
                        <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                          {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.name || '—'}</span>
                        {u.uid === user?.uid && <span className="badge badge-gray" style={{ fontSize: 10 }}>You</span>}
                      </div>
                    </td>
                    <td className="text-secondary">{u.email}</td>
                    <td>
                      <select
                        className="input"
                        style={{ width: 120, padding: '4px 8px', fontSize: 13 }}
                        value={u.role}
                        onChange={(e) => changeRole(u.uid, e.target.value as Role)}
                        disabled={u.uid === user?.uid}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="text-secondary">{u.createdAt instanceof Date ? u.createdAt.toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      {u.uid !== user?.uid && (
                        <button className="btn-icon" onClick={() => remove(u.uid)}><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Create User</h2>
                <button className="btn-icon" onClick={() => setOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                {error && <div style={{ padding: '10px 14px', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>{error}</div>}
                <div className="field"><label className="label">Full Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div className="field"><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
                <div className="field"><label className="label">Password *</label><input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min 6 characters" minLength={6} /></div>
                <div className="field">
                  <label className="label">Role *</label>
                  <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={create} disabled={saving || !form.name || !form.email || !form.password}>
                  {saving ? <span className="spinner spinner-sm" /> : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
