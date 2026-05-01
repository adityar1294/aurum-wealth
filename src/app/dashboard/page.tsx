'use client';
import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Users, CheckSquare, AlertCircle, MessageSquare } from 'lucide-react';
import { formatINR } from '@/lib/currency';
import Link from 'next/link';

interface Stats {
  totalClients: number;
  pendingTasks: number;
  overdueTasks: number;
  recentInteractions: number;
}

interface TaskItem {
  id: string;
  title: string;
  priority: string;
  dueDate: Date;
  clientName?: string;
}

interface InteractionItem {
  id: string;
  subject: string;
  type: string;
  date: Date;
  clientName?: string;
}

interface ClientItem {
  id: string;
  name: string;
  email: string;
  riskProfile: string;
  tags: string[];
  createdAt: Date;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalClients: 0, pendingTasks: 0, overdueTasks: 0, recentInteractions: 0 });
  const [pendingTasks, setPendingTasks] = useState<TaskItem[]>([]);
  const [recentInteractions, setRecentInteractions] = useState<InteractionItem[]>([]);
  const [recentClients, setRecentClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const db = getClientDb();
    if (!user) return;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const clientsQ = user.role === 'admin'
        ? query(collection(db, 'clients'))
        : query(collection(db, 'clients'), where('rmId', '==', user.uid));

      const [clientsSnap, tasksSnap, interactionsSnap] = await Promise.all([
        getDocs(clientsQ),
        getDocs(
          user.role === 'admin'
            ? query(collection(db, 'tasks'), where('status', 'in', ['pending', 'in_progress']))
            : query(collection(db, 'tasks'), where('rmId', '==', user.uid), where('status', 'in', ['pending', 'in_progress']))
        ),
        getDocs(
          user.role === 'admin'
            ? query(collection(db, 'interactions'), where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)))
            : query(collection(db, 'interactions'), where('rmId', '==', user.uid), where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)))
        ),
      ]);

      const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { id: string }>;
      const clientMap: Record<string, string> = {};
      clients.forEach((c) => {
        const pi = c.personalInfo as Record<string, string> | undefined;
        clientMap[c.id] = pi ? `${pi.firstName || ''} ${pi.lastName || ''}`.trim() : c.id;
      });

      const tasks = tasksSnap.docs.map((d) => {
        const data = d.data();
        const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
        return {
          id: d.id,
          title: data.title,
          priority: data.priority,
          dueDate,
          clientName: data.clientId ? clientMap[data.clientId] : undefined,
        };
      });

      const overdueCount = tasks.filter((t) => t.dueDate < now).length;

      setPendingTasks(tasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 5));

      const interactions = interactionsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          subject: data.subject,
          type: data.type,
          date: data.date?.toDate?.() || new Date(data.date),
          clientName: data.clientId ? clientMap[data.clientId] : undefined,
        };
      });

      setRecentInteractions(interactions.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5));

      setRecentClients(
        clients
          .sort((a, b) => {
            const aDate = (a.createdAt as Timestamp)?.toDate?.()?.getTime() || 0;
            const bDate = (b.createdAt as Timestamp)?.toDate?.()?.getTime() || 0;
            return bDate - aDate;
          })
          .slice(0, 5)
          .map((c) => {
            const pi = c.personalInfo as Record<string, string> | undefined;
            return {
              id: c.id,
              name: pi ? `${pi.firstName || ''} ${pi.lastName || ''}`.trim() : 'Unknown',
              email: pi?.email || '',
              riskProfile: (c.riskProfile as string) || 'moderate',
              tags: (c.tags as string[]) || [],
              createdAt: (c.createdAt as Timestamp)?.toDate?.() || new Date(),
            };
          })
      );

      setStats({
        totalClients: clients.length,
        pendingTasks: tasks.length,
        overdueTasks: overdueCount,
        recentInteractions: interactions.length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const riskBadge = (r: string) => {
    const map: Record<string, string> = { conservative: 'card-green', moderate: 'card-blue', aggressive: 'card-gold', very_aggressive: 'card-rose' };
    return `${map[r] || 'badge-gray'} badge-pill text-primary`;
  };

  const priorityClass = (p: string) => `priority-${p} text-mono`;

  return (
    <AppShell>
      <div className="page bg-base text-body">
        <div className="page-header">
          <div>
            <h1 className="page-title text-display">Dashboard</h1>
            <p className="page-subtitle text-secondary">Welcome back, {user?.name}</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <>
            <div className="grid-4">
              <div className="metric-card glass-wrap">
                <div className="metric-icon" style={{ background: 'var(--accent-blue)' }}>
                  <Users size={18} color="var(--text-primary)" />
                </div>
                <div className="metric-label text-secondary text-mono">Total Clients</div>
                <div className="metric-value text-display">{stats.totalClients}</div>
              </div>
              <div className="metric-card surface-dark radius-card shadow-md">
                <div className="metric-icon" style={{ background: 'var(--text-secondary)' }}>
                  <CheckSquare size={18} color="var(--surface-primary)" />
                </div>
                <div className="metric-label text-secondary text-mono">Pending Tasks</div>
                <div className="metric-value text-display text-white">{stats.pendingTasks}</div>
              </div>
              <div className="metric-card glass-wrap">
                <div className="metric-icon" style={{ background: 'var(--accent-rose)' }}>
                  <AlertCircle size={18} color="var(--text-primary)" />
                </div>
                <div className="metric-label text-secondary text-mono">Overdue Tasks</div>
                <div className="metric-value text-display" style={{ color: stats.overdueTasks > 0 ? 'var(--accent-rose)' : undefined }}>{stats.overdueTasks}</div>
              </div>
              <div className="metric-card glass-wrap">
                <div className="metric-icon" style={{ background: 'var(--accent-green)' }}>
                  <MessageSquare size={18} color="var(--text-primary)" />
                </div>
                <div className="metric-label text-secondary text-mono">Interactions (30d)</div>
                <div className="metric-value text-display">{stats.recentInteractions}</div>
              </div>
            </div>

            <div className="grid-2 mt-24">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Pending Tasks</h2>
                  <Link href="/tasks" className="btn btn-ghost btn-sm">View All</Link>
                </div>
                {pendingTasks.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px' }}>
                    <p>No pending tasks</p>
                  </div>
                ) : (
                  <div>
                    {pendingTasks.map((t) => (
                      <div key={t.id} className="info-row flex-between" style={{ padding: '10px 0' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                          {t.clientName && <div className="text-secondary" style={{ fontSize: 12 }}>{t.clientName}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div className={`${priorityClass(t.priority)}`} style={{ fontSize: 12, fontWeight: 600 }}>
                            {t.priority.toUpperCase()}
                          </div>
                          <div className={`text-muted`} style={{ fontSize: 12 }}>
                            {t.dueDate < new Date() ? (
                              <span className="text-red">Overdue</span>
                            ) : (
                              t.dueDate.toLocaleDateString('en-IN')
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Recent Interactions</h2>
                  <Link href="/interactions" className="btn btn-ghost btn-sm">View All</Link>
                </div>
                {recentInteractions.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px' }}>
                    <p>No recent interactions</p>
                  </div>
                ) : (
                  <div>
                    {recentInteractions.map((i) => (
                      <div key={i.id} className="info-row flex-between" style={{ padding: '10px 0' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.subject}</div>
                          {i.clientName && <div className="text-secondary" style={{ fontSize: 12 }}>{i.clientName}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <span className="badge badge-blue">{i.type}</span>
                          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{i.date.toLocaleDateString('en-IN')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card mt-24">
              <div className="card-header">
                <h2 className="card-title">Recent Clients</h2>
                <Link href="/clients" className="btn btn-ghost btn-sm">View All</Link>
              </div>
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Email</th>
                      <th>Risk Profile</th>
                      <th>Tags</th>
                      <th>Date Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClients.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No clients yet</td></tr>
                    ) : recentClients.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/clients/${c.id}`} className="flex-center gap-8" style={{ color: 'inherit' }}>
                            <div className="client-avatar">{c.name.charAt(0).toUpperCase()}</div>
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                          </Link>
                        </td>
                        <td className="text-secondary">{c.email}</td>
                        <td><span className={`badge ${riskBadge(c.riskProfile)}`}>{c.riskProfile}</span></td>
                        <td>
                          <div className="flex flex-wrap gap-8">
                            {c.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                          </div>
                        </td>
                        <td className="text-secondary">{c.createdAt.toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
