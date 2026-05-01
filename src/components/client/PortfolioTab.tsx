'use client';
import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Edit2, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Holding, Transaction, AssetType, TransactionType } from '@/lib/types';
import { ASSET_LABELS, ASSET_COLORS } from '@/lib/assetLabels';
import { formatINR, formatPercent } from '@/lib/currency';
import { calculateXIRR } from '@/lib/xirr';

const ASSET_TYPES = Object.keys(ASSET_LABELS) as AssetType[];
const TX_TYPES: TransactionType[] = ['buy', 'sell', 'sip', 'redemption', 'dividend'];

interface Props { clientId: string }

interface HoldingModal {
  open: boolean;
  editing: Holding | null;
}

interface TxModal {
  open: boolean;
  holdingId: string;
  editing: Transaction | null;
}

export default function PortfolioTab({ clientId }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Record<string, Transaction[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<HoldingModal>({ open: false, editing: null });
  const [txModal, setTxModal] = useState<TxModal>({ open: false, holdingId: '', editing: null });

  const [holdingForm, setHoldingForm] = useState({
    assetType: 'equity_india' as AssetType,
    name: '', symbol: '', isin: '', amfiCode: '', exchange: '',
    currency: 'INR', units: '', avgCostPrice: '', investedAmount: '',
    maturityDate: '', interestRate: '',
  });

  const [txForm, setTxForm] = useState({
    type: 'buy' as TransactionType,
    date: new Date().toISOString().split('T')[0],
    units: '', price: '', amount: '', notes: '',
  });

  useEffect(() => { loadHoldings(); }, [clientId]);

  const loadHoldings = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'holdings'), where('clientId', '==', clientId)));
      const h = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Holding));
      setHoldings(h);

      const txMap: Record<string, Transaction[]> = {};
      await Promise.all(h.map(async (holding) => {
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('holdingId', '==', holding.id), orderBy('date', 'desc')));
        txMap[holding.id] = txSnap.docs.map((d) => ({ id: d.id, ...d.data(), date: d.data().date?.toDate?.() || new Date(d.data().date) } as Transaction));
      }));
      setTransactions(txMap);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const equityHoldings = holdings.filter((h) => h.symbol && (h.assetType === 'equity_india' || h.assetType === 'equity_global'));
      const mfHoldings = holdings.filter((h) => h.amfiCode && h.assetType.includes('mutual_fund'));

      if (equityHoldings.length) {
        const symbols = equityHoldings.map((h) => h.symbol!).join(',');
        const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols)}`);
        const data = await res.json();
        await Promise.all(equityHoldings.map(async (h) => {
          const q = data[h.symbol!];
          if (q?.price) {
            const currentValue = (h.units || 0) * q.price;
            await updateDoc(doc(db, 'holdings', h.id), { currentPrice: q.price, currentValue, updatedAt: serverTimestamp() });
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
            await updateDoc(doc(db, 'holdings', h.id), { currentPrice: nav.nav, currentValue, updatedAt: serverTimestamp() });
          }
        }));
      }

      await loadHoldings();
    } catch (err) { console.error(err); }
    finally { setRefreshing(false); }
  };

  const saveHolding = async () => {
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

    if (modal.editing) {
      await updateDoc(doc(db, 'holdings', modal.editing.id), data);
    } else {
      await addDoc(collection(db, 'holdings'), { ...data, createdAt: serverTimestamp() });
    }
    setModal({ open: false, editing: null });
    loadHoldings();
  };

  const deleteHolding = async (id: string) => {
    if (!confirm('Delete this holding?')) return;
    await deleteDoc(doc(db, 'holdings', id));
    loadHoldings();
  };

  const saveTx = async () => {
    const data = {
      holdingId: txModal.holdingId,
      type: txForm.type,
      date: new Date(txForm.date),
      units: txForm.units ? parseFloat(txForm.units) : null,
      price: txForm.price ? parseFloat(txForm.price) : null,
      amount: parseFloat(txForm.amount),
      notes: txForm.notes || null,
    };
    if (txModal.editing) {
      await updateDoc(doc(db, 'transactions', txModal.editing.id), data);
    } else {
      await addDoc(collection(db, 'transactions'), data);
    }
    setTxModal({ open: false, holdingId: '', editing: null });
    loadHoldings();
  };

  const deleteTx = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await deleteDoc(doc(db, 'transactions', id));
    loadHoldings();
  };

  const openEditHolding = (h: Holding) => {
    setHoldingForm({
      assetType: h.assetType,
      name: h.name,
      symbol: h.symbol || '',
      isin: h.isin || '',
      amfiCode: h.amfiCode || '',
      exchange: h.exchange || '',
      currency: h.currency,
      units: h.units?.toString() || '',
      avgCostPrice: h.avgCostPrice?.toString() || '',
      investedAmount: h.investedAmount?.toString() || '',
      maturityDate: h.maturityDate || '',
      interestRate: h.interestRate?.toString() || '',
    });
    setModal({ open: true, editing: h });
  };

  const openNewHolding = () => {
    setHoldingForm({ assetType: 'equity_india', name: '', symbol: '', isin: '', amfiCode: '', exchange: '', currency: 'INR', units: '', avgCostPrice: '', investedAmount: '', maturityDate: '', interestRate: '' });
    setModal({ open: true, editing: null });
  };

  const openNewTx = (holdingId: string) => {
    setTxForm({ type: 'buy', date: new Date().toISOString().split('T')[0], units: '', price: '', amount: '', notes: '' });
    setTxModal({ open: true, holdingId, editing: null });
  };

  const openEditTx = (tx: Transaction) => {
    setTxForm({ type: tx.type, date: tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0], units: tx.units?.toString() || '', price: tx.price?.toString() || '', amount: tx.amount.toString(), notes: tx.notes || '' });
    setTxModal({ open: true, holdingId: tx.holdingId, editing: tx });
  };

  const totalInvested = holdings.reduce((s, h) => s + (h.investedAmount || 0), 0);
  const totalCurrent = holdings.reduce((s, h) => s + (h.currentValue || h.investedAmount || 0), 0);
  const absReturn = totalCurrent - totalInvested;
  const absReturnPct = totalInvested ? (absReturn / totalInvested) * 100 : 0;

  const allCashflows = holdings.flatMap((h) => {
    const txs = transactions[h.id] || [];
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
    name: ASSET_LABELS[type as AssetType],
    value,
    color: ASSET_COLORS[type as AssetType],
  })).filter((d) => d.value > 0);

  const hField = (field: keyof typeof holdingForm, value: string) => setHoldingForm((f) => ({ ...f, [field]: value }));
  const txField = (field: keyof typeof txForm, value: string) => setTxForm((f) => ({ ...f, [field]: value }));

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg" /></div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Portfolio</h2>
        <div className="flex gap-8">
          <button className="btn btn-secondary btn-sm" onClick={refreshPrices} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} /> Refresh Prices
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNewHolding}>
            <Plus size={14} /> Add Holding
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">Total Invested</div>
          <div className="metric-value" style={{ fontSize: 20 }}>{formatINR(totalInvested)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Current Value</div>
          <div className="metric-value" style={{ fontSize: 20 }}>{formatINR(totalCurrent)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Absolute Return</div>
          <div className="metric-value" style={{ fontSize: 20, color: absReturn >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {formatINR(absReturn)}
          </div>
          <div className="metric-sub">{formatPercent(absReturnPct)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">XIRR</div>
          <div className="metric-value" style={{ fontSize: 20, color: xirr && xirr >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {xirr !== null ? `${xirr.toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>

      {allocationData.length > 0 && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Asset Allocation</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                  {allocationData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Allocation Breakdown</h3>
            {allocationData.map((item) => (
              <div key={item.name} style={{ marginBottom: 12 }}>
                <div className="flex-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{formatINR(item.value)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${totalCurrent ? (item.value / totalCurrent) * 100 : 0}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Name</th>
              <th>Type</th>
              <th>Symbol / Code</th>
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
            {holdings.length === 0 ? (
              <tr><td colSpan={11}><div className="empty-state"><h3>No holdings yet</h3><p>Add your first holding above</p></div></td></tr>
            ) : holdings.map((h) => {
              const inv = h.investedAmount || 0;
              const cur = h.currentValue || inv;
              const ret = cur - inv;
              const retPct = inv ? (ret / inv) * 100 : 0;
              const txList = transactions[h.id] || [];
              return [
                <tr key={h.id}>
                  <td>
                    <button className="btn-icon" style={{ padding: 4 }} onClick={() => setExpanded((e) => ({ ...e, [h.id]: !e[h.id] }))}>
                      {expanded[h.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td><span className="badge badge-blue" style={{ fontSize: 11 }}>{ASSET_LABELS[h.assetType]}</span></td>
                  <td className="text-secondary">{h.symbol || h.amfiCode || '—'}</td>
                  <td className="text-secondary">{h.units?.toLocaleString('en-IN', { maximumFractionDigits: 3 }) || '—'}</td>
                  <td className="text-secondary">{h.avgCostPrice ? formatINR(h.avgCostPrice) : '—'}</td>
                  <td className="text-secondary">{h.currentPrice ? formatINR(h.currentPrice) : '—'}</td>
                  <td>{formatINR(inv)}</td>
                  <td>{formatINR(cur)}</td>
                  <td style={{ color: ret >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {formatINR(ret)} ({formatPercent(retPct)})
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn-icon" onClick={() => openEditHolding(h)}><Edit2 size={13} /></button>
                      <button className="btn-icon" onClick={() => deleteHolding(h.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>,
                expanded[h.id] && (
                  <tr key={`${h.id}-tx`}>
                    <td colSpan={11} style={{ padding: '0 0 12px 48px', background: 'var(--bg-elevated)' }}>
                      <div style={{ padding: '12px 16px' }}>
                        <div className="flex-between" style={{ marginBottom: 10 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>Transactions</span>
                          <button className="btn btn-secondary btn-sm" onClick={() => openNewTx(h.id)}><Plus size={12} /> Add</button>
                        </div>
                        {txList.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No transactions</p>
                        ) : (
                          <table style={{ width: '100%', fontSize: 13 }}>
                            <thead><tr style={{ color: 'var(--text-muted)' }}><th style={{ textAlign: 'left', padding: '4px 8px' }}>Date</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Units</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Price</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Amount</th><th style={{ textAlign: 'left', padding: '4px 8px' }}>Notes</th><th /></tr></thead>
                            <tbody>
                              {txList.map((tx) => (
                                <tr key={tx.id}>
                                  <td style={{ padding: '4px 8px' }}>{(tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string)).toLocaleDateString('en-IN')}</td>
                                  <td style={{ padding: '4px 8px' }}><span className={`badge ${tx.type === 'buy' || tx.type === 'sip' ? 'badge-green' : tx.type === 'sell' || tx.type === 'redemption' ? 'badge-red' : 'badge-blue'}`}>{tx.type}</span></td>
                                  <td style={{ padding: '4px 8px' }}>{tx.units ?? '—'}</td>
                                  <td style={{ padding: '4px 8px' }}>{tx.price ? formatINR(tx.price) : '—'}</td>
                                  <td style={{ padding: '4px 8px' }}>{formatINR(tx.amount)}</td>
                                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{tx.notes || '—'}</td>
                                  <td style={{ padding: '4px 8px' }}>
                                    <div className="flex gap-8">
                                      <button className="btn-icon" onClick={() => openEditTx(tx)}><Edit2 size={12} /></button>
                                      <button className="btn-icon" onClick={() => deleteTx(tx.id)}><Trash2 size={12} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div className="modal-overlay" onClick={() => setModal({ open: false, editing: null })}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal.editing ? 'Edit Holding' : 'Add Holding'}</h2>
              <button className="btn-icon" onClick={() => setModal({ open: false, editing: null })}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field" style={{ gridColumn: '1/-1' }}>
                  <label className="label">Asset Type</label>
                  <select className="select" value={holdingForm.assetType} onChange={(e) => hField('assetType', e.target.value)}>
                    {ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1/-1' }}>
                  <label className="label">Name *</label>
                  <input className="input" value={holdingForm.name} onChange={(e) => hField('name', e.target.value)} placeholder="e.g. Reliance Industries" />
                </div>
                <div className="field"><label className="label">Symbol (NSE/BSE)</label><input className="input" value={holdingForm.symbol} onChange={(e) => hField('symbol', e.target.value)} placeholder="RELIANCE.NS" /></div>
                <div className="field"><label className="label">ISIN</label><input className="input" value={holdingForm.isin} onChange={(e) => hField('isin', e.target.value)} /></div>
                <div className="field"><label className="label">AMFI Code (MF)</label><input className="input" value={holdingForm.amfiCode} onChange={(e) => hField('amfiCode', e.target.value)} /></div>
                <div className="field"><label className="label">Exchange</label><input className="input" value={holdingForm.exchange} onChange={(e) => hField('exchange', e.target.value)} placeholder="NSE, BSE, NYSE…" /></div>
                <div className="field"><label className="label">Currency</label><select className="select" value={holdingForm.currency} onChange={(e) => hField('currency', e.target.value)}><option value="INR">INR</option><option value="USD">USD</option></select></div>
                <div className="field"><label className="label">Units</label><input className="input" type="number" value={holdingForm.units} onChange={(e) => hField('units', e.target.value)} /></div>
                <div className="field"><label className="label">Avg Cost Price</label><input className="input" type="number" value={holdingForm.avgCostPrice} onChange={(e) => hField('avgCostPrice', e.target.value)} /></div>
                <div className="field"><label className="label">Invested Amount (₹)</label><input className="input" type="number" value={holdingForm.investedAmount} onChange={(e) => hField('investedAmount', e.target.value)} /></div>
                <div className="field"><label className="label">Maturity Date</label><input className="input" type="date" value={holdingForm.maturityDate} onChange={(e) => hField('maturityDate', e.target.value)} /></div>
                <div className="field"><label className="label">Interest Rate (%)</label><input className="input" type="number" value={holdingForm.interestRate} onChange={(e) => hField('interestRate', e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal({ open: false, editing: null })}>Cancel</button>
              <button className="btn btn-primary" onClick={saveHolding}>Save</button>
            </div>
          </div>
        </div>
      )}

      {txModal.open && (
        <div className="modal-overlay" onClick={() => setTxModal({ open: false, holdingId: '', editing: null })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{txModal.editing ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <button className="btn-icon" onClick={() => setTxModal({ open: false, holdingId: '', editing: null })}>×</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Type</label>
                <select className="select" value={txForm.type} onChange={(e) => txField('type', e.target.value)}>
                  {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Date</label><input className="input" type="date" value={txForm.date} onChange={(e) => txField('date', e.target.value)} /></div>
              <div className="field"><label className="label">Units</label><input className="input" type="number" value={txForm.units} onChange={(e) => txField('units', e.target.value)} /></div>
              <div className="field"><label className="label">Price per Unit</label><input className="input" type="number" value={txForm.price} onChange={(e) => txField('price', e.target.value)} /></div>
              <div className="field"><label className="label">Amount (₹) *</label><input className="input" type="number" value={txForm.amount} onChange={(e) => txField('amount', e.target.value)} required /></div>
              <div className="field"><label className="label">Notes</label><input className="input" value={txForm.notes} onChange={(e) => txField('notes', e.target.value)} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTxModal({ open: false, holdingId: '', editing: null })}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTx} disabled={!txForm.amount}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
