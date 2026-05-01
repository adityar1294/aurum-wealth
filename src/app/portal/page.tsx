'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding, Transaction } from '@/lib/types';
import { ASSET_LABELS, ASSET_COLORS } from '@/lib/assetLabels';
import { formatINR, formatPercent, formatCompact } from '@/lib/currency';
import { calculateXIRR } from '@/lib/xirr';

export default function PortalPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/portal/login'); return; }
    if (user.role !== 'client') { router.replace('/dashboard'); return; }
    if (user.clientId) {
      setClientId(user.clientId);
      load(user.clientId);
    }
  }, [user, authLoading]);

  const load = async (cid: string) => {
    setLoading(true);
    try {
      const hSnap = await getDocs(query(collection(db, 'holdings'), where('clientId', '==', cid)));
      const h = hSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Holding));
      setHoldings(h);

      const allTx: Transaction[] = [];
      await Promise.all(h.map(async (holding) => {
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('holdingId', '==', holding.id)));
        txSnap.docs.forEach((d) => {
          allTx.push({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() || new Date(d.data().date) } as Transaction);
        });
      }));
      setTransactions(allTx);
    } finally { setLoading(false); }
  };

  const refreshPrices = async () => {
    if (!clientId) return;
    setRefreshing(true);
    try {
      const equityHoldings = holdings.filter((h) => h.symbol);
      const mfHoldings = holdings.filter((h) => h.amfiCode);

      if (equityHoldings.length) {
        const symbols = equityHoldings.map((h) => h.symbol!).join(',');
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
        const data = await res.json();
        setHoldings((prev) => prev.map((h) => {
          if (h.symbol && data[h.symbol]) {
            return { ...h, currentPrice: data[h.symbol].price, currentValue: (h.units || 0) * data[h.symbol].price };
          }
          return h;
        }));
      }

      if (mfHoldings.length) {
        const codes = mfHoldings.map((h) => h.amfiCode!).join(',');
        const res = await fetch(`/api/mf-nav?codes=${encodeURIComponent(codes)}`);
        const data = await res.json();
        setHoldings((prev) => prev.map((h) => {
          if (h.amfiCode && data[h.amfiCode]) {
            return { ...h, currentPrice: data[h.amfiCode].nav, currentValue: (h.units || 0) * data[h.amfiCode].nav };
          }
          return h;
        }));
      }
    } finally { setRefreshing(false); }
  };

  if (authLoading || loading) {
    return (
      <div className="loading-center" style={{ height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-green))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Aurum Wealth
        </div>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const totalInvested = holdings.reduce((s, h) => s + (h.investedAmount || 0), 0);
  const totalCurrent = holdings.reduce((s, h) => s + (h.currentValue || h.investedAmount || 0), 0);
  const absReturn = totalCurrent - totalInvested;
  const absReturnPct = totalInvested ? (absReturn / totalInvested) * 100 : 0;

  const allCashflows = holdings.flatMap((h) => {
    const txs = transactions.filter((t) => t.holdingId === h.id);
    const flows = txs.map((tx) => ({
      amount: (tx.type === 'buy' || tx.type === 'sip') ? -tx.amount : tx.amount,
      date: tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string),
    }));
    if (h.currentValue) flows.push({ amount: h.currentValue, date: new Date() });
    return flows;
  });
  const xirr = allCashflows.length >= 2 ? calculateXIRR(allCashflows) : null;

  const allocationData = Object.entries(
    holdings.reduce((acc, h) => {
      const v = h.currentValue || h.investedAmount || 0;
      acc[h.assetType] = (acc[h.assetType] || 0) + v;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, value]) => ({
    name: ASSET_LABELS[type as keyof typeof ASSET_LABELS] || type,
    value, color: ASSET_COLORS[type as keyof typeof ASSET_COLORS] || '#888',
  })).filter((d) => d.value > 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-green))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Aurum Wealth
        </div>
        <div className="flex-center gap-12">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Client Portal</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await signOut(); router.replace('/portal/login'); }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      <div className="page" style={{ maxWidth: 1200 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">My Portfolio</h1>
            <p className="page-subtitle">Your investment overview</p>
          </div>
          <button className="btn btn-secondary" onClick={refreshPrices} disabled={refreshing}>
            <RefreshCw size={14} /> Refresh Prices
          </button>
        </div>

        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="metric-card" style={{ borderColor: 'var(--accent-blue)' }}>
            <div className="metric-label">Total Invested</div>
            <div className="metric-value" style={{ fontSize: 22 }}>{formatCompact(totalInvested)}</div>
            <div className="metric-sub">{formatINR(totalInvested)}</div>
          </div>
          <div className="metric-card" style={{ borderColor: 'var(--accent-green)' }}>
            <div className="metric-label">Current Value</div>
            <div className="metric-value" style={{ fontSize: 22 }}>{formatCompact(totalCurrent)}</div>
            <div className="metric-sub">{formatINR(totalCurrent)}</div>
          </div>
          <div className="metric-card" style={{ borderColor: absReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            <div className="metric-label">Total Return</div>
            <div className="flex-center gap-6">
              {absReturn >= 0 ? <TrendingUp size={18} color="var(--accent-green)" /> : <TrendingDown size={18} color="var(--accent-red)" />}
              <div className="metric-value" style={{ fontSize: 22, color: absReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {formatCompact(Math.abs(absReturn))}
              </div>
            </div>
            <div className="metric-sub" style={{ color: absReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {formatPercent(absReturnPct)}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">XIRR</div>
            <div className="metric-value" style={{ fontSize: 22, color: xirr && xirr >= 0 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
              {xirr !== null ? `${xirr.toFixed(2)}%` : '—'}
            </div>
            <div className="metric-sub">Annualised Return</div>
          </div>
        </div>

        {allocationData.length > 0 && (
          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card">
              <h2 className="card-title" style={{ marginBottom: 16 }}>Asset Allocation</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {allocationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h2 className="card-title" style={{ marginBottom: 16 }}>Breakdown</h2>
              {allocationData.map((item) => (
                <div key={item.name} style={{ marginBottom: 14 }}>
                  <div className="flex-between" style={{ marginBottom: 5 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{item.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{formatINR(item.value)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {totalCurrent ? ((item.value / totalCurrent) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${totalCurrent ? (item.value / totalCurrent) * 100 : 0}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="card-title" style={{ marginBottom: 16 }}>Holdings</h2>
          {holdings.length === 0 ? (
            <div className="empty-state"><h3>No holdings yet</h3><p>Your portfolio will appear here once your relationship manager adds holdings</p></div>
          ) : (
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr><th>Name</th><th>Type</th><th>Units</th><th>Current Price</th><th>Invested</th><th>Current Value</th><th>Return</th></tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const inv = h.investedAmount || 0;
                    const cur = h.currentValue || inv;
                    const ret = cur - inv;
                    const retPct = inv ? (ret / inv) * 100 : 0;
                    return (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{h.name}</td>
                        <td><span className="badge badge-blue" style={{ fontSize: 11 }}>{ASSET_LABELS[h.assetType] || h.assetType}</span></td>
                        <td className="text-secondary">{h.units?.toLocaleString('en-IN', { maximumFractionDigits: 3 }) || '—'}</td>
                        <td className="text-secondary">{h.currentPrice ? formatINR(h.currentPrice) : '—'}</td>
                        <td>{formatINR(inv)}</td>
                        <td style={{ fontWeight: 600 }}>{formatINR(cur)}</td>
                        <td style={{ color: ret >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                          {formatINR(ret)}<br />
                          <span style={{ fontSize: 12, fontWeight: 400 }}>{formatPercent(retPct)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
