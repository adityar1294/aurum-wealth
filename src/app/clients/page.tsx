'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import { Search, Plus, Filter } from 'lucide-react';
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
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }
    if (riskFilter) result = result.filter((c) => c.riskProfile === riskFilter);
    setFiltered(result);
  }, [clients, search, riskFilter]);

  const loadClients = async () => {
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

  const riskBadge = (r: string) => {
    const map: Record<string, string> = { conservative: 'badge-green', moderate: 'badge-blue', aggressive: 'badge-yellow', very_aggressive: 'badge-red' };
    return map[r] || 'badge-gray';
  };

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Clients</h1>
            <p className="page-subtitle">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/clients/new" className="btn btn-primary">
            <Plus size={16} /> Add Client
          </Link>
        </div>

        <div className="flex flex-wrap gap-12" style={{ marginBottom: 20 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} color="var(--text-muted)" />
            <input placeholder="Search by name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 180 }} value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
            <option value="">All Risk Profiles</option>
            {RISK_PROFILES.map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Risk Profile</th>
                  <th>Tax Slab</th>
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
                        <p>Try adjusting your search or add a new client</p>
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
                    <td><span className={`badge ${riskBadge(c.riskProfile)}`}>{c.riskProfile.replace('_', ' ')}</span></td>
                    <td className="text-secondary">{c.taxSlab}</td>
                    <td>
                      <div className="flex flex-wrap gap-8">
                        {c.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                        {c.tags.length > 3 && <span className="text-muted" style={{ fontSize: 12 }}>+{c.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="text-secondary">{c.createdAt.toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
