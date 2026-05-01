'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Edit2, Trash2, RefreshCw, ChevronDown, ChevronRight, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding, Transaction, AssetType, TransactionType } from '@/lib/types';
import { ASSET_LABELS, ASSET_COLORS } from '@/lib/assetLabels';
import { formatINR, formatPercent } from '@/lib/currency';
import { calculateXIRR } from '@/lib/xirr';
import type { TickerResult } from '@/app/api/search-ticker/route';

const ASSET_TYPES = Object.keys(ASSET_LABELS) as AssetType[];
const TX_TYPES: TransactionType[] = ['buy', 'sell', 'sip', 'redemption', 'dividend'];

interface Props { clientId: string }

const EMPTY_HOLDING = {
  assetType: 'equity_india' as AssetType,
  name: '', symbol: '', isin: '', amfiCode: '', exchange: '',
  currency: 'INR', units: '', avgCostPrice: '', investedAmount: '',
  maturityDate: '', interestRate: '',
};

const EMPTY_TX = {
  type: 'buy' as TransactionType,
  date: new Date().toISOString().split('T')[0],
  units: '', price: '', amount: '', notes: '',
};

function guessAssetType(type: string, exchange: string): AssetType {
  const ex = exchange.toUpperCase();
  const t = type.toUpperCase();
  if (t === 'MUTUALFUND') return ex === 'NSE' || ex === 'BSE' || !ex ? 'mutual_fund_india' : 'mutual_fund_global';
  if (t === 'ETF') return ex === 'NSE' || ex === 'BSE' ? 'equity_india' : 'equity_global';
  if (t === 'EQUITY') return (ex === 'NSE' || ex === 'BSE' || ex === 'NMS' || ex === 'BOM') ? 'equity_india' : 'equity_global';
  return 'equity_india';
}

export default function PortfolioTab({ clientId }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Record<string, Transaction[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showHoldingModal, setShowHoldingModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [txHoldingId, setTxHoldingId] = useState('');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [holdingForm, setHoldingForm] = useState(EMPTY_HOLDING);
  const [txForm, setTxForm] = useState(EMPTY_TX);

  // Ticker search state
  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerResults, setTickerResults] = useState<TickerResult[]>([]);
  const [tickerSearching, setTickerSearching] = useState(false);
  const [showTickerDropdown, setShowTickerDropdown] = useState(false);
  const tickerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadHoldings(); }, [clientId]);

  // Close ticker dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowTickerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadHoldings = async () => {
    const db = getClientDb();
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'holdings'), where('clientId', '==', clientId)));
      const h = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Holding));
      setHoldings(h);
      const txMap: Record<string, Transaction[]> = {};
      await Promise.all(h.map(async (holding) => {
        const txSnap = await getDocs(
          query(collection(db, 'transactions'), where('holdingId', '==', holding.id), orderBy('date', 'desc'))
        );
        txMap[holding.id] = txSnap.docs.map((d) => ({
          id: d.id, ...d.data(),
          date: d.data().date?.toDate?.() || new Date(d.data().date),
        } as Transaction));
      }));
      setTransactions(txMap);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const refreshPrices = async () => {
    const db = getClientDb();
    setRefreshing(true);
    try {
      const equityHoldings = holdings.filter(
        (h) => h.symbol && ['equity_india', 'equity_global', 'etf_india', 'etf_global'].includes(h.assetType)
      );
      const mfHoldings = holdings.filter((h) => h.amfiCode && h.assetType.includes('mutual_fund'));

      if (equityHoldings.length) {
        const symbols = equityHoldings.map((h) => h.symbol!).join(',');
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
        const data = await res.json();
        await Promise.all(equityHoldings.map(async (h) => {
          const q = data[h.symbol!];
          if (q?.price) {
            const currentValue = (h.units || 0) * q.price;
            await updateDoc(doc(db, 'holdings', h.id), {
              currentPrice: q.price, currentValue, updatedAt: serverTimestamp(),
            });
          }
        }));
      }

      if (mfHoldings.length) {
        const codes = mfHoldings.map((h) => h.amfiCode!).join(',');
        const res = await fetch(`/api/mf-nav?codes=${encodeURIComponent(codes)}`);
        const data = await res.json();
        await Promise.all(mfHoldings.map(async (h) => {
          const nav = data[h.amfiCode!];
          if (nav?.nav) {
            const currentValue = (h.units || 0) * nav.nav;
            await updateDoc(doc(db, 'holdings', h.id), {
              currentPrice: nav.nav, currentValue, updatedAt: serverTimestamp(),
            });
          }
        }));
      }

      setLastRefreshed(new Date());
      await loadHoldings();
    } catch (err) { console.error(err); }
    finally { setRefreshing(false); }
  };

  // Ticker search with debounce
  const searchTicker = useCallback((q: string) => {
    if (tickerTimeout.current) clearTimeout(tickerTimeout.current);
    if (q.length < 2) { setTickerResults([]); setShowTickerDropdown(false); return; }
    setTickerSearching(true);
    tickerTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-ticker?q=${encodeURIComponent(q)}`);
        const data: TickerResult[] = await res.json();
        setTickerResults(data);
        setShowTickerDropdown(data.length > 0);
      } catch {}
      finally { setTickerSearching(false); }
    }, 300);
  }, []);

  const selectTicker = (t: TickerResult) => {
    const assetType = guessAssetType(t.type, t.exchange);
    setHoldingForm((f) => ({
      ...f,
      symbol: t.symbol,
      name: t.name,
      exchange: t.exchange,
      currency: t.currency || 'INR',
      assetType,
      amfiCode: t.type === 'MUTUALFUND' ? f.amfiCode : '',
    }));
    setTickerQuery(t.symbol);
    setShowTickerDropdown(false);
  };

  const saveHolding = async () => {
    const db = getClientDb();
    const data = {
      clientId,
      assetType: holdingForm.assetType,
      name: holdingForm.name,
      symbol: holdingForm.symbol || null,
      isin: holdingForm.isin || null,
      amfiCode: holdingForm.amfiCode || null,
      exchange: holdingForm.exchange || null,
      currency: holdingForm.currency,
      units: holdingForm.units ? parseFloat(holdingForm.units) : null,
      avgCostPrice: holdingForm.avgCostPrice ? parseFloat(holdingForm.avgCostPrice) : null,
      investedAmount: holdingForm.investedAmount ? parseFloat(holdingForm.investedAmount) : null,
      currentValue: holdingForm.investedAmount ? parseFloat(holdingForm.investedAmount) : null,
      maturityDate: holdingForm.maturityDate || null,
      interestRate: holdingForm.interestRate ? parseFloat(holdingForm.interestRate) : null,
      updatedAt: serverTimestamp(),
    };
    if (editingHolding) {
      await updateDoc(doc(db, 'holdings', editingHolding.id), data);
    } else {
      await addDoc(collection(db, 'holdings'), { ...data, createdAt: serverTimestamp() });
    }
    setShowHoldingModal(false);
    loadHoldings();
  };

  const deleteHolding = async (id: string) => {
    const db = getClientDb();
    if (!confirm('Delete this holding and all its transactions?')) return;
    await deleteDoc(doc(db, 'holdings', id));
    loadHoldings();
  };

  const saveTx = async () => {
    const db = getClientDb();
    const data = {
      holdingId: txHoldingId,
      type: txForm.type,
      date: new Date(txForm.date),
      units: txForm.units ? parseFloat(txForm.units) : null,
      price: txForm.price ? parseFloat(txForm.price) : null,
      amount: parseFloat(txForm.amount),
      notes: txForm.notes || null,
    };
    if (editingTx) {
      await updateDoc(doc(db, 'transactions', editingTx.id), data);
    } else {
      await addDoc(collection(db, 'transactions'), data);
    }
    setShowTxModal(false);
    loadHoldings();
  };

  const deleteTx = async (id: string) => {
    const db = getClientDb();
    if (!confirm('Delete this transaction?')) return;
    await deleteDoc(doc(db, 'transactions', id));
    loadHoldings();
  };

  const openNewHolding = () => {
    setEditingHolding(null);
    setHoldingForm(EMPTY_HOLDING);
    setTickerQuery('');
    setTickerResults([]);
    setShowHoldingModal(true);
  };

  const openEditHolding = (h: Holding) => {
    setEditingHolding(h);
    setTickerQuery(h.symbol || '');
    setHoldingForm({
      assetType: h.assetType, name: h.name, symbol: h.symbol || '',
      isin: h.isin || '', amfiCode: h.amfiCode || '', exchange: h.exchange || '',
      currency: h.currency, units: h.units?.toString() || '',
      avgCostPrice: h.avgCostPrice?.toString() || '',
      investedAmount: h.investedAmount?.toString() || '',
      maturityDate: h.maturityDate || '', interestRate: h.interestRate?.toString() || '',
    });
    setShowHoldingModal(true);
  };

  const openNewTx = (holdingId: string) => {
    setEditingTx(null);
    setTxHoldingId(holdingId);
    setTxForm(EMPTY_TX);
    setShowTxModal(true);
  };

  const openEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setTxHoldingId(tx.holdingId);
    const d = tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string);
    setTxForm({
      type: tx.type,
      date: d.toISOString().split('T')[0],
      units: tx.units?.toString() || '',
      price: tx.price?.toString() || '',
      amount: tx.amount.toString(),
      notes: tx.notes || '',
    });
    setShowTxModal(true);
  };

  const hf = (field: keyof typeof holdingForm, value: string) =>
    setHoldingForm((f) => ({ ...f, [field]: value }));
  const tf = (field: keyof typeof txForm, value: string) =>
    setTxForm((f) => ({ ...f, [field]: value }));

  const totalInvested = holdings.reduce((s, h) => s + (h.investedAmount || 0), 0);
  const totalCurrent = holdings.reduce((s, h) => s + (h.currentValue || h.investedAmount || 0), 0);
  const absReturn = totalCurrent - totalInvested;
  const absReturnPct = totalInvested ? (absReturn / totalInvested) * 100 : 0;

  const allCashflows = holdings.flatMap((h) => {
    const txs = transactions[h.id] || [];
    const flows = txs.map((tx) => ({
      amount: tx.type === 'buy' || tx.type === 'sip' ? -tx.amount : tx.amount,
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
    name: ASSET_LABELS[type as AssetType], value, color: ASSET_COLORS[type as AssetType],
  })).filter((d) => d.value > 0);

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg" /></div>;

  const isPositive = absReturn >= 0;

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Portfolio</h2>
        <div className="flex gap-8">
          {lastRefreshed && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              Updated {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={refreshPrices} disabled={refreshing}>
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? 'Refreshing…' : 'Refresh Prices'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNewHolding}>
            <Plus size={14} /> Add Security
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Invested', value: formatINR(totalInvested), color: undefined },
          { label: 'Current Value', value: formatINR(totalCurrent), color: undefined },
          {
            label: 'Gain / Loss',
            value: `${isPositive ? '+' : ''}${formatINR(absReturn)}`,
            sub: formatPercent(absReturnPct),
            color: isPositive ? 'var(--accent-green)' : 'var(--accent-red)',
          },
          {
            label: 'XIRR',
            value: xirr !== null ? `${xirr >= 0 ? '+' : ''}${xirr.toFixed(2)}%` : '—',
            color: xirr !== null ? (xirr >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined,
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="metric-card">
            <div className="metric-label">{label}</div>
            <div className="metric-value" style={{ fontSize: 18, color }}>{value}</div>
            {sub && <div className="metric-sub" style={{ color }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      {allocationData.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Asset Allocation</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {allocationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allocationData.map((item) => (
                <div key={item.name}>
                  <div className="flex-between" style={{ marginBottom: 4 }}>
                    <div className="flex-center gap-6">
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13 }}>{item.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{formatINR(item.value)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                        {totalCurrent ? `${((item.value / totalCurrent) * 100).toFixed(1)}%` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${totalCurrent ? (item.value / totalCurrent) * 100 : 0}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Holdings table */}
      {holdings.length === 0 ? (
        <div className="empty-state">
          <TrendingUp size={40} style={{ opacity: 0.3 }} />
          <h3>No securities yet</h3>
          <p>Add your first holding — stocks, mutual funds, bonds, or any other asset</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openNewHolding}>
            <Plus size={14} /> Add Security
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Security</th>
                <th>Type</th>
                <th>Units</th>
                <th>Avg Cost</th>
                <th>Cur. Price</th>
                <th>Invested</th>
                <th>Value</th>
                <th>Return</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const inv = h.investedAmount || 0;
                const cur = h.currentValue || inv;
                const ret = cur - inv;
                const retPct = inv ? (ret / inv) * 100 : 0;
                const pos = ret >= 0;
                const txList = transactions[h.id] || [];
                return [
                  <tr key={h.id} style={{ cursor: 'pointer' }}>
                    <td>
                      <button className="btn-icon" style={{ padding: 4 }}
                        onClick={() => setExpanded((e) => ({ ...e, [h.id]: !e[h.id] }))}>
                        {expanded[h.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{h.name}</div>
                      {h.symbol && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{h.symbol}{h.exchange ? ` · ${h.exchange}` : ''}</div>}
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{ fontSize: 11 }}>
                        {ASSET_LABELS[h.assetType]}
                      </span>
                    </td>
                    <td className="text-secondary">{h.units?.toLocaleString('en-IN', { maximumFractionDigits: 3 }) ?? '—'}</td>
                    <td className="text-secondary">{h.avgCostPrice ? formatINR(h.avgCostPrice) : '—'}</td>
                    <td className="text-secondary">
                      {h.currentPrice ? (
                        <span style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {formatINR(h.currentPrice)}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{formatINR(inv)}</td>
                    <td style={{ fontWeight: 600 }}>{formatINR(cur)}</td>
                    <td>
                      <div style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600, fontSize: 13 }}>
                        <div className="flex-center gap-4">
                          {pos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {formatPercent(retPct)}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 400 }}>{pos ? '+' : ''}{formatINR(ret)}</div>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-6">
                        <button className="btn-icon" onClick={() => openEditHolding(h)}><Edit2 size={13} /></button>
                        <button className="btn-icon" onClick={() => deleteHolding(h.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>,
                  expanded[h.id] && (
                    <tr key={`${h.id}-tx`}>
                      <td colSpan={10} style={{ padding: 0, background: 'var(--bg-elevated)' }}>
                        <div style={{ padding: '12px 20px 12px 48px' }}>
                          <div className="flex-between" style={{ marginBottom: 10 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>Transactions</span>
                            <button className="btn btn-secondary btn-sm" onClick={() => openNewTx(h.id)}>
                              <Plus size={12} /> Add Transaction
                            </button>
                          </div>
                          {txList.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No transactions logged yet.</p>
                          ) : (
                            <table style={{ width: '100%', fontSize: 13 }}>
                              <thead>
                                <tr style={{ color: 'var(--text-muted)' }}>
                                  {['Date', 'Type', 'Units', 'Price', 'Amount', 'Notes', ''].map((h) => (
                                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {txList.map((tx) => {
                                  const d = tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string);
                                  const isBuy = tx.type === 'buy' || tx.type === 'sip';
                                  return (
                                    <tr key={tx.id}>
                                      <td style={{ padding: '5px 8px' }}>{d.toLocaleDateString('en-IN')}</td>
                                      <td style={{ padding: '5px 8px' }}>
                                        <span className={`badge ${isBuy ? 'badge-green' : tx.type === 'dividend' ? 'badge-blue' : 'badge-red'}`}>
                                          {tx.type}
                                        </span>
                                      </td>
                                      <td style={{ padding: '5px 8px' }}>{tx.units ?? '—'}</td>
                                      <td style={{ padding: '5px 8px' }}>{tx.price ? formatINR(tx.price) : '—'}</td>
                                      <td style={{ padding: '5px 8px', fontWeight: 600, color: isBuy ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                        {isBuy ? '-' : '+'}{formatINR(tx.amount)}
                                      </td>
                                      <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{tx.notes || '—'}</td>
                                      <td style={{ padding: '5px 8px' }}>
                                        <div className="flex gap-6">
                                          <button className="btn-icon" onClick={() => openEditTx(tx)}><Edit2 size={12} /></button>
                                          <button className="btn-icon" onClick={() => deleteTx(tx.id)}><Trash2 size={12} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Holding Modal */}
      {showHoldingModal && (
        <div className="modal-overlay" onClick={() => setShowHoldingModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingHolding ? 'Edit Security' : 'Add Security'}</h2>
              <button className="btn-icon" onClick={() => setShowHoldingModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* Ticker Search */}
              <div className="field" ref={searchRef} style={{ position: 'relative' }}>
                <label className="label">Search by Ticker / Name</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 32 }}
                    placeholder="e.g. Reliance, INFY, HDFC…"
                    value={tickerQuery}
                    onChange={(e) => {
                      setTickerQuery(e.target.value);
                      searchTicker(e.target.value);
                    }}
                    onFocus={() => tickerResults.length > 0 && setShowTickerDropdown(true)}
                  />
                  {tickerSearching && (
                    <div className="spinner spinner-sm" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  )}
                </div>
                {showTickerDropdown && tickerResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                    maxHeight: 260, overflowY: 'auto', marginTop: 4,
                  }}>
                    {tickerResults.map((t) => (
                      <button
                        key={t.symbol}
                        type="button"
                        onClick={() => selectTicker(t)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                          cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.symbol}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{t.name}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.exchange}</div>
                          <div style={{ fontSize: 11, color: 'var(--accent-blue)', marginTop: 2 }}>{t.type}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

              {/* Form fields */}
              <div className="form-grid">
                <div className="field" style={{ gridColumn: '1/-1' }}>
                  <label className="label">Asset Type *</label>
                  <select className="select" value={holdingForm.assetType} onChange={(e) => hf('assetType', e.target.value)}>
                    {ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1/-1' }}>
                  <label className="label">Security Name *</label>
                  <input className="input" value={holdingForm.name} onChange={(e) => hf('name', e.target.value)} placeholder="e.g. Reliance Industries Ltd." />
                </div>
                <div className="field">
                  <label className="label">Symbol</label>
                  <input className="input" value={holdingForm.symbol} onChange={(e) => hf('symbol', e.target.value)} placeholder="RELIANCE.NS" />
                </div>
                <div className="field">
                  <label className="label">Exchange</label>
                  <input className="input" value={holdingForm.exchange} onChange={(e) => hf('exchange', e.target.value)} placeholder="NSE / BSE / NYSE" />
                </div>
                <div className="field">
                  <label className="label">ISIN</label>
                  <input className="input" value={holdingForm.isin} onChange={(e) => hf('isin', e.target.value)} placeholder="INE002A01018" />
                </div>
                <div className="field">
                  <label className="label">AMFI Code (Mutual Funds)</label>
                  <input className="input" value={holdingForm.amfiCode} onChange={(e) => hf('amfiCode', e.target.value)} placeholder="120503" />
                </div>
                <div className="field">
                  <label className="label">Currency</label>
                  <select className="select" value={holdingForm.currency} onChange={(e) => hf('currency', e.target.value)}>
                    <option value="INR">INR ₹</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Units / Quantity</label>
                  <input className="input" type="number" value={holdingForm.units} onChange={(e) => hf('units', e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label className="label">Avg Purchase Price (₹)</label>
                  <input className="input" type="number" value={holdingForm.avgCostPrice} onChange={(e) => hf('avgCostPrice', e.target.value)} placeholder="0.00" />
                </div>
                <div className="field">
                  <label className="label">Total Invested (₹)</label>
                  <input className="input" type="number" value={holdingForm.investedAmount} onChange={(e) => hf('investedAmount', e.target.value)} placeholder="0.00" />
                </div>
                <div className="field">
                  <label className="label">Maturity Date</label>
                  <input className="input" type="date" value={holdingForm.maturityDate} onChange={(e) => hf('maturityDate', e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Interest Rate (%)</label>
                  <input className="input" type="number" value={holdingForm.interestRate} onChange={(e) => hf('interestRate', e.target.value)} placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHoldingModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveHolding} disabled={!holdingForm.name}>
                {editingHolding ? 'Save Changes' : 'Add Security'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Transaction Modal */}
      {showTxModal && (
        <div className="modal-overlay" onClick={() => setShowTxModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingTx ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <button className="btn-icon" onClick={() => setShowTxModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Transaction Type</label>
                <select className="select" value={txForm.type} onChange={(e) => tf('type', e.target.value)}>
                  {TX_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Date</label>
                <input className="input" type="date" value={txForm.date} onChange={(e) => tf('date', e.target.value)} />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="label">Units</label>
                  <input className="input" type="number" value={txForm.units} onChange={(e) => tf('units', e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label className="label">Price per Unit (₹)</label>
                  <input className="input" type="number" value={txForm.price} onChange={(e) => tf('price', e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="field">
                <label className="label">Total Amount (₹) *</label>
                <input className="input" type="number" value={txForm.amount} onChange={(e) => tf('amount', e.target.value)} required placeholder="0.00" />
              </div>
              <div className="field">
                <label className="label">Notes</label>
                <input className="input" value={txForm.notes} onChange={(e) => tf('notes', e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTxModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTx} disabled={!txForm.amount}>
                {editingTx ? 'Save Changes' : 'Add Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
