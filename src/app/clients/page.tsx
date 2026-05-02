'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Search, Plus, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { decrypt } from '@/lib/encryption';
import { RiskProfile } from '@/lib/types';

interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  riskProfile: RiskProfile;
  taxSlab: string;
  tags: string[];
  createdAt: Date;
}

const RISK_PROFILES: RiskProfile[] = ['conservative', 'moderate', 'aggressive', 'very_aggressive'];

const RISK_META: Record<string, { badge: string; card: string; label: string }> = {
  conservative:   { badge: 'badge-green',  card: 'client-card-green',  label: 'Conservative' },
  moderate:       { badge: 'badge-blue',   card: 'client-card-blue',   label: 'Moderate' },
  aggressive:     { badge: 'badge-yellow', card: 'client-card-yellow', label: 'Aggressive' },
  very_aggressive:{ badge: 'badge-red',    card: 'client-card-dark',   label: 'Very Aggressive' },
};

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filtered, setFiltered] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    loadClients();
  }, [user]);

  useEffect(() => {
    let result = clients;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q),
      );
    }
    if (riskFilter) result = result.filter((c) => c.riskProfile === riskFilter);
    setFiltered(result);
  }, [clients, search, riskFilter]);

  const loadClients = async () => {
    const db = getClientDb();
    if (!user) return;
    try {
      const q = user.role === 'admin'
        ? query(collection(db, 'clients'))
        : query(collection(db, 'clients'), where('rmId', '==', user.uid));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => {
        const data = d.data();
        const pi = data.personalInfo || {};
        return {
          id: d.id,
          name: `${pi.firstName || ''} ${pi.lastName || ''}`.trim(),
          email: pi.email || '',
          phone: decrypt(pi.phone || ''),
          riskProfile: data.riskProfile || 'moderate',
          taxSlab: data.taxSlab || '',
          tags: data.tags || [],
          createdAt: data.createdAt?.toDate?.() || new Date(),
        };
      });
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setClients(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const riskBadge = (r: string) => RISK_META[r]?.badge || 'badge-gray';

  return (
    <AppShell>
      <div className="page dashboard-page">

        {/* ── Hero ── */}
        <div className="dashboard-hero">
          <div>
            <div className="hero-date">Client book</div>
            <h1>Clients.</h1>
            <p>your {clients.length} relationships.</p>
          </div>
          <div className="hero-actions">
            <Link href="/clients/new" className="btn btn-primary">
              <Plus size={16} /> New Client
            </Link>
          </div>
        </div>

        {/* ── Risk profile summary cards ── */}
        <div className="dashboard-metrics" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          {RISK_PROFILES.map((r) => {
            const count = clients.filter((c) => c.riskProfile === r).length;
            const meta  = RISK_META[r];
            const active = riskFilter === r;
            return (
              <div
                key={r}
                className={`top-client-card ${meta.card}`}
                style={{ cursor: 'pointer', opacity: riskFilter && !active ? 0.5 : 1 }}
                onClick={() => setRiskFilter(active ? '' : r)}
              >
                <div className="top-client-meta">
                  <span>{meta.label}</span>
                  <i style={{ background: active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)' }}>
                    <ArrowUpRight size={14} />
                  </i>
                </div>
                <strong style={{ fontSize: 40, letterSpacing: '-0.04em' }}>{count}</strong>
                <small>{count === 1 ? 'client' : 'clients'}</small>
              </div>
            );
          })}
        </div>

        {/* ── Filter bar ── */}
        <div className="dashboard-panel" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div className="flex flex-wrap gap-12">
            <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                placeholder="Search by name, email, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input"
              style={{ width: 200 }}
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="">All Risk Profiles</option>
              {RISK_PROFILES.map((r) => (
                <option key={r} value={r}>{RISK_META[r].label}</option>
              ))}
            </select>
            {(search || riskFilter) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setSearch(''); setRiskFilter(''); }}
              >
                Clear filters · {filtered.length} shown
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <div className="dashboard-panel" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'none', border: 'none', background: 'transparent' }}>
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Risk profile</th>
                    <th>Tax slab</th>
                    <th>Tags</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <h3>No clients found</h3>
                          <p>Try adjusting your search or add a new client.</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clients/${c.id}`} className="flex-center gap-8" style={{ color: 'inherit' }}>
                          <div className="client-avatar">{(c.name || '?').charAt(0).toUpperCase()}</div>
                          <span style={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</span>
                        </Link>
                      </td>
                      <td className="text-secondary">{c.email}</td>
                      <td className="text-secondary">{c.phone}</td>
                      <td>
                        <span className={`badge ${riskBadge(c.riskProfile)}`}>
                          {RISK_META[c.riskProfile]?.label || c.riskProfile}
                        </span>
                      </td>
                      <td className="text-secondary">{c.taxSlab || '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-8">
                          {c.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                          {c.tags.length > 3 && (
                            <span className="text-muted" style={{ fontSize: 12 }}>+{c.tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-secondary">{c.createdAt.toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
