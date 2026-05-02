'use client';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import {
  ArrowUpRight,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  Plus,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/hooks/useAuth';
import { getClientDb } from '@/lib/firebase';
import { formatINR } from '@/lib/currency';
import { decrypt } from '@/lib/encryption';

interface DashboardLead {
  id: string;
  stage: string;
  estimatedValue: number;
}

interface DashboardClient {
  id: string;
  name: string;
  family: string;
  riskProfile: string;
  birthday?: Date;
  currentValue: number;
  investedAmount: number;
}

interface DashboardTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: Date;
  completedAt?: Date;
  clientId?: string;
  clientName?: string;
}

interface DashboardEvent {
  id: string;
  title: string;
  type: 'task' | 'meeting' | 'event' | 'follow_up';
  date: Date;
  clientName?: string;
}

interface RiskFlag {
  tone: 'gold' | 'red' | 'blue';
  label: string;
  detail: string;
  action?: string;
}

const PIPELINE_STAGES = ['agreement_signed', 'fee_paid'];
const AUM_TARGET = 365_00_00_000;
const REVIEW_TARGET_RATIO = 0.62;
const TOUCHPOINT_TARGET = 15;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RISK_STYLE: Record<string, string> = {
  conservative: 'client-card-dark',
  moderate: 'client-card-blue',
  aggressive: 'client-card-green',
  very_aggressive: 'client-card-yellow',
};

const toDate = (value: unknown, fallback = new Date()) => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const pct = (value: number, total: number) => Math.max(0, Math.min(100, total ? Math.round((value / total) * 100) : 0));
const cr = (value: number) => `${(value / 1_00_00_000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;

function ProgressRing({ value, color }: { value: number; color: string }) {
  return (
    <div className="goal-ring" style={{ '--ring-value': `${value * 3.6}deg`, '--ring-color': color } as CSSProperties}>
      <span>{value}%</span>
    </div>
  );
}

function CalendarCard({ events }: { events: DashboardEvent[] }) {
  const today = new Date();
  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
    setSelectedDay(null);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset      = new Date(viewYear, viewMonth, 1).getDay();

  const byDay = useMemo(() => {
    const map: Record<string, DashboardEvent[]> = {};
    events.forEach((event) => {
      const key = dayKey(event.date);
      map[key] = [...(map[key] || []), event];
    });
    return map;
  }, [events]);

  const isCurrentMonth = viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const todayEvents    = byDay[dayKey(today)] || [];

  const selectedDate   = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : null;
  const selectedEvents = selectedDate ? (byDay[dayKey(selectedDate)] || []) : [];

  const TYPE_DOT: Record<string, string> = {
    task: 'var(--accent-blue)', meeting: 'var(--accent-green)', follow_up: 'var(--yolk-dk)', event: 'var(--accent-purple)',
  };

  return (
    <div className="dashboard-panel calendar-panel">
      <div className="dashboard-card-head">
        <div className="flex-center gap-8">
          <h2>
            {MONTHS[viewMonth]}{viewYear !== today.getFullYear() ? ` ${viewYear}` : ''}
          </h2>
          <span>
            {isCurrentMonth && todayEvents.length > 0
              ? `${todayEvents.length} today`
              : selectedEvents.length > 0
                ? `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}`
                : ''}
          </span>
        </div>
        <div className="flex-center gap-8">
          <button className="dash-icon-button" type="button" aria-label="Previous month" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </button>
          <button className="dash-icon-button" type="button" aria-label="Next month" onClick={nextMonth}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span><i className="legend-dot calm" /> light</span>
        <span><i className="legend-dot steady" /> steady</span>
        <span><i className="legend-dot busy" /> hectic</span>
      </div>

      <div className="calendar-grid calendar-weekdays">
        {WEEKDAYS.map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
      </div>

      <div className="calendar-grid">
        {Array.from({ length: offset }).map((_, i) => <div key={`blank-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day  = i + 1;
          const date = new Date(viewYear, viewMonth, day);
          const count    = (byDay[dayKey(date)] || []).length;
          const isToday  = isCurrentMonth && day === today.getDate();
          const isSelected = day === selectedDay;
          const mood = count >= 4 ? 'hectic' : count >= 2 ? 'steady' : count === 1 ? 'calm' : '';
          return (
            <div
              key={day}
              className={`calendar-day ${mood} ${isToday ? 'today' : ''} ${isSelected && !isToday ? 'selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDay(day === selectedDay ? null : day)}
              title={`${count} event${count !== 1 ? 's' : ''}`}
            >
              <span>{day}</span>
              {count > 0 && <b />}
            </div>
          );
        })}
      </div>

      {/* Day event list */}
      {selectedDay !== null && (
        <div style={{ marginTop: 14, borderTop: '1px solid rgba(22,20,15,0.07)', paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
            {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          {selectedEvents.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink3)' }}>No events scheduled.</p>
          ) : selectedEvents.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: TYPE_DOT[ev.type] || 'var(--ink3)',
              }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{ev.title}</div>
                {ev.clientName && (
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{ev.clientName}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<DashboardClient[]>([]);
  const [leads, setLeads] = useState<DashboardLead[]>([]);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [interactionsCount, setInteractionsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const db = getClientDb();
    if (!user) return;
    setLoading(true);
    try {
      const now = new Date();
      const clientQ = user.role === 'client' && user.clientId
        ? query(collection(db, 'clients'), where('__name__', '==', user.clientId))
        : user.role === 'admin'
          ? query(collection(db, 'clients'))
          : query(collection(db, 'clients'), where('rmId', '==', user.uid));

      const clientsSnap = await getDocs(clientQ);
      const rawClients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { id: string }>;
      const clientIds = new Set(rawClients.map((client) => client.id));
      const clientNames: Record<string, string> = {};

      rawClients.forEach((client) => {
        const pi = (client.personalInfo || {}) as Record<string, string>;
        clientNames[client.id] = `${pi.firstName || ''} ${pi.lastName || ''}`.trim() || 'Unnamed client';
      });

      const holdingsByClient: Record<string, { currentValue: number; investedAmount: number }> = {};
      await Promise.all(rawClients.map(async (client) => {
        const snap = await getDocs(query(collection(db, 'holdings'), where('clientId', '==', client.id)));
        holdingsByClient[client.id] = snap.docs.reduce((acc, docSnap) => {
          const data = docSnap.data();
          const investedAmount = Number(data.investedAmount || 0);
          return {
            currentValue: acc.currentValue + Number(data.currentValue || investedAmount || 0),
            investedAmount: acc.investedAmount + investedAmount,
          };
        }, { currentValue: 0, investedAmount: 0 });
      }));

      // Load leads for pipeline metric
      const leadsQ = user.role === 'admin'
        ? query(collection(db, 'leads'))
        : query(collection(db, 'leads'), where('rmId', '==', user.uid));
      const leadsSnap = await getDocs(leadsQ);
      const leadsData: DashboardLead[] = leadsSnap.docs.map((d) => ({
        id: d.id,
        stage: d.data().stage || '',
        estimatedValue: Number(d.data().estimatedValue || 0),
      }));

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const [tasksSnap, interactionsSnap] = await Promise.all([
        getDocs(
          user.role === 'client' && user.clientId
            ? query(collection(db, 'tasks'), where('clientId', '==', user.clientId))
            : user.role === 'admin'
              ? query(collection(db, 'tasks'))
              : query(collection(db, 'tasks'), where('rmId', '==', user.uid))
        ),
        getDocs(
          user.role === 'client' && user.clientId
            ? query(collection(db, 'interactions'), where('clientId', '==', user.clientId), where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)))
            : user.role === 'admin'
              ? query(collection(db, 'interactions'), where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)))
              : query(collection(db, 'interactions'), where('rmId', '==', user.uid), where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)))
        ),
      ]);

      const taskItems = tasksSnap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            title: data.title || 'Untitled task',
            priority: data.priority || 'medium',
            status: data.status || 'pending',
            dueDate: toDate(data.dueDate),
            completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
            clientId: data.clientId,
            clientName: data.clientId ? clientNames[data.clientId] : undefined,
          };
        })
        .filter((task) => !task.clientId || clientIds.has(task.clientId) || user.role !== 'client');

      const calendarEvents: DashboardEvent[] = taskItems
        .filter((task) => task.status !== 'completed' && task.status !== 'cancelled')
        .map((task) => ({
          id: `task-${task.id}`,
          title: task.title,
          type: 'task',
          date: task.dueDate,
          clientName: task.clientName,
        }));

      const interactionEvents: DashboardEvent[] = [];
      interactionsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.clientId && !clientIds.has(data.clientId) && user.role === 'client') return;
        const type = data.type === 'meeting' || data.type === 'review' ? 'meeting' : 'event';
        interactionEvents.push({
          id: `interaction-${docSnap.id}`,
          title: data.subject || data.type || 'Interaction',
          type,
          date: toDate(data.date),
          clientName: data.clientId ? clientNames[data.clientId] : undefined,
        });
        if (data.followUpDate) {
          interactionEvents.push({
            id: `follow-${docSnap.id}`,
            title: data.followUpNote || `Follow up: ${data.subject || 'client'}`,
            type: 'follow_up',
            date: toDate(data.followUpDate),
            clientName: data.clientId ? clientNames[data.clientId] : undefined,
          });
        }
      });

      setClients(rawClients.map((client) => {
        const pi = (client.personalInfo || {}) as Record<string, string>;
        const values = holdingsByClient[client.id] || { currentValue: 0, investedAmount: 0 };
        return {
          id: client.id,
          name: clientNames[client.id],
          family: pi.lastName ? `${pi.lastName} family` : 'Client household',
          riskProfile: (client.riskProfile as string) || 'moderate',
          birthday: pi.dateOfBirth ? toDate(decrypt(pi.dateOfBirth), undefined as unknown as Date) : undefined,
          currentValue: values.currentValue,
          investedAmount: values.investedAmount,
        };
      }));
      setLeads(leadsData);
      setTasks(taskItems);
      setEvents([...calendarEvents, ...interactionEvents]);
      setInteractionsCount(interactionsSnap.size);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (task: DashboardTask) => {
    const db = getClientDb();
    // Optimistic update so the row disappears immediately
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: 'completed' } : t));
    window.dispatchEvent(new Event('aurum:xp-updated'));
    try {
      await updateDoc(doc(db, 'tasks', task.id), { status: 'completed', completedAt: new Date() });
    } catch {
      // Rollback on failure
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };

  const now = new Date();
  const activeClients = clients.length;
  const totalAum = clients.reduce((sum, client) => sum + client.currentValue, 0);
  const invested = clients.reduce((sum, client) => sum + client.investedAmount, 0);
  const gainPct = invested ? ((totalAum - invested) / invested) * 100 : 0;
  const pendingTasks = tasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');
  const overdue = pendingTasks.filter((task) => task.dueDate < startOfDay(now)).length;
  const todayTasks = pendingTasks.filter((task) => dayKey(task.dueDate) === dayKey(now)).length;
  const topClients = [...clients].sort((a, b) => b.currentValue - a.currentValue).slice(0, 5);
  const nextTasks = pendingTasks
    .filter((task) => task.dueDate <= new Date(now.getTime() + 7 * 86400000))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 4);
  const meetingsThisMonth = events.filter((event) => event.type === 'meeting' && event.date.getMonth() === now.getMonth()).length;
  const pipelineLeads = leads.filter((l) => PIPELINE_STAGES.includes(l.stage));
  const pipeline = pipelineLeads.reduce((s, l) => s + l.estimatedValue, 0);
  const reviewTarget = Math.max(1, Math.ceil(activeClients * REVIEW_TARGET_RATIO));
  const reviewsDone = events.filter((event) => event.type === 'meeting' && event.date >= new Date(now.getFullYear(), now.getMonth(), 1)).length;
  const touchpoints = interactionsCount;
  const clientGoalTarget = Math.max(AUM_TARGET, totalAum || AUM_TARGET);
  const goalsTitle = user?.role === 'client' ? 'Your goals' : 'Your achievements';
  const rankLabel = user?.role === 'client' ? 'On track' : user?.role === 'admin' ? 'Admin view' : 'Top RM';
  const goalMetrics = user?.role === 'client'
    ? [
        { label: 'Portfolio goal', sub: `${cr(totalAum)} / ${cr(clientGoalTarget)}`, value: pct(totalAum, clientGoalTarget), color: '#f0c84a' },
        { label: 'Reviews done', sub: `${reviewsDone} this month`, value: pct(reviewsDone, Math.max(1, reviewsDone + pendingTasks.length)), color: '#3b5cf2' },
        { label: 'Open actions', sub: `${pendingTasks.length} pending`, value: pct(Math.max(0, 10 - pendingTasks.length), 10), color: '#4ddc7b' },
      ]
    : [
        { label: 'Q2 AUM target', sub: `${cr(totalAum)} / ${cr(AUM_TARGET)}`, value: pct(totalAum, AUM_TARGET), color: '#f0c84a' },
        { label: 'Reviews done', sub: `${reviewsDone} / ${reviewTarget} clients`, value: pct(reviewsDone, reviewTarget), color: '#3b5cf2' },
        { label: 'Touchpoints', sub: 'last 30 days', value: pct(touchpoints, TOUCHPOINT_TARGET), color: '#4ddc7b' },
      ];

  const overdueList  = pendingTasks.filter((t) => t.dueDate < now);
  const riskFlags: RiskFlag[] = [
    // Allocation drift — aggressive / very-aggressive clients
    ...clients
      .filter((c) => c.riskProfile === 'aggressive' || c.riskProfile === 'very_aggressive')
      .slice(0, 1)
      .map((c) => {
        const gain = c.investedAmount
          ? ((c.currentValue - c.investedAmount) / c.investedAmount) * 100
          : 0;
        return {
          tone: 'gold' as const,
          label: `DRIFT · ${c.name.toUpperCase()}`,
          detail: `${c.riskProfile.replace('_', ' ')} profile — ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% overall return. Verify allocation still fits the client's risk mandate.`,
          action: 'Schedule an allocation review meeting',
        };
      }),
    // Overdue tasks
    ...overdueList
      .slice(0, 1)
      .map((t) => {
        const days = Math.floor((now.getTime() - t.dueDate.getTime()) / 86400000);
        const extra = overdueList.length > 1 ? ` (+${overdueList.length - 1} more overdue)` : '';
        return {
          tone: 'red' as const,
          label: `OVERDUE · ${(t.clientName || 'GENERAL').toUpperCase()}`,
          detail: `"${t.title}" is ${days} day${days !== 1 ? 's' : ''} past due.${extra}`,
          action: 'Complete the task or reschedule with a new due date',
        };
      }),
    // Portfolio below cost basis
    ...clients
      .filter((c) => c.currentValue > 0 && c.investedAmount > 0 && c.currentValue < c.investedAmount)
      .slice(0, 1)
      .map((c) => {
        const loss    = c.investedAmount - c.currentValue;
        const lossPct = ((loss / c.investedAmount) * 100).toFixed(1);
        return {
          tone: 'gold' as const,
          label: `VOLATILITY · ${c.name.toUpperCase()}`,
          detail: `Portfolio is ₹${(loss / 1e7).toFixed(2)} Cr below cost basis (−${lossPct}%). Consider documenting your rationale.`,
          action: 'Log a note or review the asset mix',
        };
      }),
  ].slice(0, 3);

  const personalTouchpoints = clients
    .filter((client) => client.birthday && client.birthday.getMonth() === now.getMonth())
    .slice(0, 3);

  return (
    <AppShell>
      <div className="page dashboard-page">
        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <>
            <div className="dashboard-hero">
              <div>
                <div className="hero-date">{now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })} · {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</div>
                <h1>Good evening, {user?.name?.split(' ')[0] || 'there'}.</h1>
                <p>here's your book today.</p>
              </div>
              <div className="hero-actions">
                {user?.role !== 'client' && <Link href="/clients/new" className="btn btn-primary"><Plus size={16} /> New client</Link>}
                <Link href="/interactions" className="btn btn-secondary">Log interaction</Link>
              </div>
            </div>

            <div className="dashboard-metrics">
              <div className="metric-feature metric-aum">
                <span>Total AUM</span>
                <strong>{formatINR(totalAum).replace('.00', '')}</strong>
                <em>Cr</em>
                <div className="metric-foot">
                  <b className={gainPct >= 0 ? 'positive' : 'negative'}>{gainPct >= 0 ? '↑' : '↓'} {Math.abs(gainPct).toFixed(1)}%</b>
                  <small>{formatINR(Math.abs(totalAum - invested)).replace('.00', '')} this month</small>
                </div>
              </div>
              <div className="metric-feature metric-clients">
                <span>Active Clients</span>
                <strong>{activeClients}</strong>
                <small>+{Math.max(0, clients.filter((c) => c.currentValue > 0).length)} funded</small>
                <div className="avatar-stack">
                  {clients.slice(0, 4).map((client) => <i key={client.id}>{client.name.charAt(0)}</i>)}
                  {clients.length > 4 && <i>{clients.length - 4}+</i>}
                </div>
              </div>
              <div className="metric-feature metric-dark">
                <span>Tasks Due</span>
                <strong>{pendingTasks.length}</strong>
                <small>{overdue} overdue · {todayTasks} today</small>
                <div className="mini-bars">{[1, 2, 3, 4, 5, 6, 7].map((n) => <i key={n} className={n <= Math.min(7, pendingTasks.length) ? 'on' : ''} />)}</div>
              </div>
              <div className="metric-feature metric-pipeline">
                <span>Pipeline</span>
                <strong>{pipeline ? `₹${cr(pipeline)}` : '₹0 Cr'}</strong>
                <small>{pipelineLeads.length} leads · {meetingsThisMonth} meetings</small>
                <div className="bar-spark">{[28, 42, 31, 50, 40, 58, 52].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
              </div>
            </div>

            <div className="dashboard-layout">
              <main>
                <section className="dashboard-panel">
                  <div className="dashboard-card-head">
                    <div className="flex-center gap-8">
                      <h2>Top clients by AUM</h2>
                      <span>live from client portfolios</span>
                    </div>
                    <Link href="/clients" className="pill-link">View all →</Link>
                  </div>
                  <div className="top-client-grid">
                    {topClients.length === 0 ? (
                      <div className="empty-state"><h3>No portfolio data yet</h3><p>Add client holdings to populate AUM rankings.</p></div>
                    ) : topClients.map((client, index) => {
                      const gain = client.investedAmount ? ((client.currentValue - client.investedAmount) / client.investedAmount) * 100 : 0;
                      return (
                        <Link key={client.id} href={`/clients/${client.id}`} className={`top-client-card ${RISK_STYLE[client.riskProfile] || 'client-card-blue'}`}>
                          <div className="top-client-meta">
                            <span>{client.riskProfile.replace('_', ' ')}</span>
                            <i><ArrowUpRight size={16} /></i>
                          </div>
                          <h3>{client.name}</h3>
                          <p>{client.family}</p>
                          <strong>{cr(client.currentValue)}</strong>
                          <small>{gain >= 0 ? '▲' : '▼'} {Math.abs(gain).toFixed(1)}% MTD</small>
                          <b>{index + 1}</b>
                        </Link>
                      );
                    })}
                  </div>
                </section>

                <section className="dashboard-panel pending-panel">
                  <div className="dashboard-card-head">
                    <div className="flex-center gap-8">
                      <h2>Pending tasks</h2>
                      <span>next 7 days</span>
                    </div>
                    <Link href="/tasks" className="pill-link">View all →</Link>
                  </div>
                  {nextTasks.length === 0 ? (
                    <div className="empty-state"><h3>No pending tasks due this week</h3></div>
                  ) : nextTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={`dashboard-task-row ${index === 0 ? 'featured' : ''}`}
                      style={{ cursor: 'pointer' }}
                      title="Click to mark complete"
                      onClick={() => completeTask(task)}
                    >
                      <Circle size={18} />
                      <div>
                        <h3>{task.title}</h3>
                        <p>{task.clientName || 'General'} · {dayKey(task.dueDate) === dayKey(now) ? 'Today' : task.dueDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      </div>
                      <span>{task.priority.toUpperCase()}</span>
                    </div>
                  ))}
                  <p className="xp-note"><Check size={13} /> Click a task to complete it · +10 XP each</p>
                </section>
              </main>

              <aside>
                <CalendarCard events={events} />

                <section className="dashboard-panel goals-panel">
                  <div className="dashboard-card-head">
                    <div className="flex-center gap-8">
                      <h2>{goalsTitle}</h2>
                      <span>{MONTHS[now.getMonth()]}</span>
                    </div>
                    <strong className="rank-pill"><Trophy size={13} /> {rankLabel}</strong>
                  </div>
                  <div className="goal-grid">
                    {goalMetrics.map((metric) => (
                      <div key={metric.label}>
                        <ProgressRing value={metric.value} color={metric.color} />
                        <h3>{metric.label}</h3>
                        <p>{metric.sub}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="dashboard-panel risk-panel">
                  <div className="dashboard-card-head">
                    <div className="flex-center gap-8">
                      <h2>Risk & review</h2>
                      <span>{riskFlags.length} flag{riskFlags.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14, marginTop: -6 }}>
                    Drift, overdue tasks, and volatility alerts across your book.
                  </p>
                  {riskFlags.length === 0 ? (
                    <div className="soft-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={14} color="var(--accent-green)" /> All clear — no active flags.
                    </div>
                  ) : riskFlags.map((flag) => (
                    <div key={`${flag.label}-${flag.detail}`} className={`risk-row ${flag.tone}`}>
                      <b />
                      <div>
                        <span>{flag.label}</span>
                        <p style={{ marginTop: 3 }}>{flag.detail}</p>
                        {flag.action && (
                          <p style={{ marginTop: 5, fontSize: 11, fontWeight: 600, color: 'var(--ink3)', fontStyle: 'italic' }}>
                            → {flag.action}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </section>

                <section className="dashboard-panel touch-panel">
                  <div className="dashboard-card-head">
                    <div className="flex-center gap-8">
                      <h2>Personal touchpoints</h2>
                      <span>upcoming</span>
                    </div>
                  </div>
                  {personalTouchpoints.length === 0 ? (
                    <div className="soft-empty">No birthdays this month.</div>
                  ) : personalTouchpoints.map((client) => (
                    <div key={client.id} className="touch-row">
                      <i>{client.name.split(' ').map((part) => part.charAt(0)).join('').slice(0, 2)}</i>
                      <div>
                        <h3>{client.name}</h3>
                        <p>birthday · {client.birthday?.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <Link href={`/clients/${client.id}`}>Note</Link>
                    </div>
                  ))}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
