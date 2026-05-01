'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import AppShell from '@/components/AppShell';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { formatINR, formatPercent, formatCompact } from '@/lib/currency';
import { ASSET_LABELS, ASSET_COLORS } from '@/lib/assetLabels';
import { Holding } from '@/lib/types';
import { TrendingUp, Users, BarChart2 } from 'lucide-react';

interface ClientSummary {
  id: string;
  name: string;
  invested: number;
  current: number;
  return: number;
  returnPct: number;
}

export default function PortfolioAnalysisPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [holdingsByAsset, setHoldingsByAsset] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAUM, setTotalAUM] = useState(0);
  const [totalInvested, setTotalInvested] = useState(0);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    const db = getClientDb();
    if (!user) return;
    setLoading(true);
    try {
      const clientQ = user.role === 'admin'
        ? query(collection(db, 'clients'))
        : query(collection(db, 'clients'), where('rmId', '==', user.uid));
      const clientSnap = await getDocs(clientQ);

      const summaries: ClientSummary[] = [];
      const assetMap: Record<string, number> = {};
      let aum = 0;
      let inv = 0;

      await Promise.all(clientSnap.docs.map(async (cd) => {
        const pi = cd.data().personalInfo || {};
        const name = `${pi.firstName || ''} ${pi.lastName || ''}`.trim();
        const hSnap = await getDocs(query(collection(db, 'holdings'), where('clientId', '==', cd.id)));
        const holdings = hSnap.docs.map((d) => d.data() as Holding);
        const invested = holdings.reduce((s, h) => s + (h.investedAmount || 0), 0);
        const current = holdings.reduce((s, h) => s + (h.currentValue || h.investedAmount || 0), 0);
        const ret = current - invested;
        const retPct = invested ? (ret / invested) * 100 : 0;

        holdings.forEach((h) => {
          assetMap[h.assetType] = (assetMap[h.assetType] || 0) + (h.currentValue || h.investedAmount || 0);
        });

        aum += current;
        inv += invested;
        summaries.push({ id: cd.id, name, invested, current, return: ret, returnPct: retPct });
      }));

      summaries.sort((a, b) => b.current - a.current);
      setClients(summaries);
      setTotalAUM(aum);
      setTotalInvested(inv);
      setHoldingsByAsset(
        Object.entries(assetMap)
          .map(([type, value]) => ({ name: ASSET_LABELS[type as keyof typeof ASSET_LABELS] || type, value, color: ASSET_COLORS[type as keyof typeof ASSET_COLORS] || '#888' }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
      );
    } finally { setLoading(false); }
  };

  const totalReturn = totalAUM - totalInvested;
  const totalReturnPct = totalInvested ? (totalReturn / totalInvested) * 100 : 0;

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Portfolio Analysis</h1>
            <p className="page-subtitle">Aggregate view across all clients</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner spinner-lg" /></div>
        ) : (
          <>
            <div className="grid-3" style={{ marginBottom: 24 }}>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'var(--accent-blue-dim)' }}><BarChart2 size={18} color="var(--accent-blue)" /></div>
                <div className="metric-label">Total AUM</div>
                <div className="metric-value" style={{ fontSize: 22, color: 'var(--accent-blue)' }}>{formatCompact(totalAUM)}</div>
                <div className="metric-sub">{formatINR(totalAUM)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'var(--accent-gold-dim)' }}><TrendingUp size={18} color="var(--accent-gold)" /></div>
                <div className="metric-label">Total Return</div>
                <div className="metric-value" style={{ fontSize: 22, color: totalReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {formatCompact(Math.abs(totalReturn))}
                </div>
                <div className="metric-sub" style={{ color: totalReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{formatPercent(totalReturnPct)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-icon" style={{ background: 'var(--accent-green-dim)' }}><Users size={18} color="var(--accent-green)" /></div>
                <div className="metric-label">Clients</div>
                <div className="metric-value">{clients.length}</div>
              </div>
            </div>

            {holdingsByAsset.length > 0 && (
              <div className="grid-2" style={{ marginBottom: 24 }}>
                <div className="card">
                  <h2 className="card-title" style={{ marginBottom: 16 }}>AUM by Asset Class</h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={holdingsByAsset} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                        {holdingsByAsset.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatINR(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <h2 className="card-title" style={{ marginBottom: 16 }}>Distribution</h2>
                  {holdingsByAsset.map((item) => (
                    <div key={item.name} style={{ marginBottom: 12 }}>
                      <div className="flex-between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCompact(item.value)}</span>
                          <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                            {totalAUM ? ((item.value / totalAUM) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </div>
                      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${totalAUM ? (item.value / totalAUM) * 100 : 0}%`, background: item.color }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 24 }}>
              <h2 className="card-title" style={{ marginBottom: 16 }}>Client Portfolio Comparison</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={clients.slice(0, 10)} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                  <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="invested" fill="var(--accent-blue)" name="Invested" opacity={0.7} />
                  <Bar dataKey="current" fill="var(--accent-green)" name="Current Value" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Client</th><th>Invested</th><th>Current Value</th><th>Return (₹)</th><th>Return (%)</th></tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr><td colSpan={5}><div className="empty-state"><h3>No portfolio data</h3><p>Add holdings to clients to see analysis</p></div></td></tr>
                  ) : clients.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{formatINR(c.invested)}</td>
                      <td style={{ fontWeight: 600 }}>{formatINR(c.current)}</td>
                      <td style={{ color: c.return >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{formatINR(c.return)}</td>
                      <td style={{ color: c.returnPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{formatPercent(c.returnPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
