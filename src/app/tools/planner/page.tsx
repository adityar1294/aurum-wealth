'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import AppShell from '@/components/AppShell';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatINR, formatCompact } from '@/lib/currency';
import {
  computePlan, runMonteCarlo, blendedReturn,
  DEFAULT_STATE, RISK_DEFAULTS, INSTRUMENT_RETURNS,
  type PlannerState, type ExpenseStream, type IncomeStream,
  type AdditionalAsset, type FinancialGoal, type SIPEffect,
  type InstrumentParams, type RiskProfile, type AssetKind, type SIPEffectType,
  type LoanEntry,
} from '@/lib/financialPlanning';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';
import {
  ChevronDown, ChevronUp, Plus, Trash2, Download, Upload,
  AlertTriangle, CheckCircle, Settings, BarChart2, User,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const LS_KEY = 'aurum_planner_v1';

function loadFromLS(): PlannerState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

// ─── Small reusable components ────────────────────────────────────────────────

function Section({
  title, subtitle, icon, open, onToggle, children,
}: {
  title: string; subtitle: string; icon: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 18px', background: open ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left',
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-blue-dim)',
          color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{icon}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</span>
        </span>
        {open ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
      </button>
      {open && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, hint, col }: { label: string; children: React.ReactNode; hint?: string; col?: boolean }) {
  return (
    <div className={col ? undefined : 'field'} style={{ marginBottom: col ? 0 : 12 }}>
      <label className="label" style={{ fontSize: 12, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>{hint}</span>}
    </div>
  );
}

function Num({ value, onChange, min, max, step, prefix }: {
  value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; prefix?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      {prefix && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none', zIndex: 1 }}>
          {prefix}
        </span>
      )}
      <input
        className="input"
        type="number"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step}
        style={{ paddingLeft: prefix ? 24 : undefined, width: '100%', fontSize: 13 }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [state, setState] = useState<PlannerState>(loadFromLS);
  const [tab, setTab] = useState<'configure' | 'results'>('configure');
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const [exporting, setExporting] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientList, setClientList] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string; email?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => localStorage.setItem(LS_KEY, JSON.stringify(state)), 800);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const db = getClientDb();
        const snap = await getDocs(query(collection(db, 'clients'), orderBy('name')));
        setClientList(snap.docs.map((d) => ({ id: d.id, name: d.data().name, email: d.data().email })));
      } catch {}
    })();
  }, []);

  const toggleSection = (i: number) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const upd = <K extends keyof PlannerState>(key: K, val: PlannerState[K]) =>
    setState((s) => ({ ...s, [key]: val }));

  const results = useMemo(() => computePlan(state), [state]);
  const mc = useMemo(() => runMonteCarlo(state, results.requiredCorpus, 1500), [state, results.requiredCorpus]);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPDF = async (client?: { id: string; name: string; email?: string } | null) => {
    setShowClientPicker(false);
    setExporting(true);
    try {
      const [{ pdf }, { PlannerPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/plannerPDF'),
      ]);
      const blob = await pdf(
        <PlannerPDF
          state={state}
          results={results}
          mc={mc}
          clientName={client?.name}
          generatedAt={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = client ? `${client.name.replace(/\s+/g, '-')}-retirement-plan.pdf` : 'retirement-plan.pdf';
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const triggerExport = () => setShowClientPicker(true);

  // ── Import JSON ───────────────────────────────────────────────────────────
  const handleImport = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          setState({ ...DEFAULT_STATE, ...JSON.parse(e.target?.result as string) });
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    inp.click();
  };

  // ── Section 1: Basic Info ─────────────────────────────────────────────────
  const section1 = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      <Field label="Current Age">
        <Num value={state.currentAge} onChange={(v) => upd('currentAge', v)} min={18} max={80} />
      </Field>
      <Field label="Retirement Age">
        <Num value={state.retirementAge} onChange={(v) => upd('retirementAge', v)} min={40} max={80} />
      </Field>
      <Field label="Life Expectancy">
        <Num value={state.lifeExpectancy} onChange={(v) => upd('lifeExpectancy', v)} min={60} max={100} />
      </Field>
      <Field label="Employment Type">
        <select className="input" style={{ fontSize: 13, width: '100%' }} value={state.employmentType}
          onChange={(e) => upd('employmentType', e.target.value as PlannerState['employmentType'])}>
          <option value="salaried">Salaried</option>
          <option value="self_employed">Self-Employed</option>
          <option value="business">Business Owner</option>
        </select>
      </Field>
      <Field label="Current Corpus (₹)">
        <Num value={state.currentCorpus} onChange={(v) => upd('currentCorpus', v)} prefix="₹" step={100000} />
      </Field>
      <Field label="Monthly SIP (₹)">
        <Num value={state.monthlySIP} onChange={(v) => upd('monthlySIP', v)} prefix="₹" step={1000} />
      </Field>
      <Field label="SIP Step-up (%/yr)" hint="Annual % increase in SIP">
        <Num value={state.sipStepUpPct} onChange={(v) => upd('sipStepUpPct', v)} step={0.5} min={0} max={30} />
      </Field>
      <Field label="Target Override (₹)" hint="0 = auto-compute">
        <Num value={state.targetCorpusOverride} onChange={(v) => upd('targetCorpusOverride', v)} prefix="₹" step={100000} />
      </Field>
    </div>
  );

  // ── Section 2: Expenses ───────────────────────────────────────────────────
  const addExpense = () => upd('expenses', [
    ...state.expenses,
    { id: uid(), name: 'New Expense', monthlyAmount: 20000, inflationRate: 6, stepUpAfterRetirement: false, adjustments: [] },
  ]);
  const removeExpense = (id: string) => upd('expenses', state.expenses.filter((e) => e.id !== id));
  const updExpense = (id: string, p: Partial<ExpenseStream>) =>
    upd('expenses', state.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)));

  const section2 = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 32px', gap: 10, alignItems: 'end', marginBottom: 8, padding: '0 4px' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Description</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Monthly Amount (₹)</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Inflation (%)</span>
        <span />
      </div>
      {state.expenses.map((e) => (
        <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 140px 32px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <input className="input" style={{ fontSize: 13 }} value={e.name} onChange={(ev) => updExpense(e.id, { name: ev.target.value })} />
          <Num value={e.monthlyAmount} onChange={(v) => updExpense(e.id, { monthlyAmount: v })} prefix="₹" step={1000} />
          <Num value={e.inflationRate} onChange={(v) => updExpense(e.id, { inflationRate: v })} step={0.5} />
          <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', padding: '6px' }} onClick={() => removeExpense(e.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5, marginTop: 4 }} onClick={addExpense}>
        <Plus size={13} /> Add Expense
      </button>
    </div>
  );

  // ── Section 3: Passive Income ─────────────────────────────────────────────
  const addIncome = () => upd('incomeStreams', [
    ...state.incomeStreams,
    { id: uid(), name: 'Rental Income', monthlyAmount: 0, preRetirementGrowth: 5, postRetirementGrowth: 3, hasEndDate: false, endDate: '' },
  ]);
  const removeIncome = (id: string) => upd('incomeStreams', state.incomeStreams.filter((i) => i.id !== id));
  const updIncome = (id: string, p: Partial<IncomeStream>) =>
    upd('incomeStreams', state.incomeStreams.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const section3 = (
    <div>
      {state.incomeStreams.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Add rental income, pension, dividends, or any recurring income continuing into retirement.
        </p>
      )}
      {state.incomeStreams.map((inc) => (
        <div key={inc.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 160px', gap: 12, marginBottom: 10, alignItems: 'end' }}>
            <Field label="Source Name">
              <input className="input" style={{ fontSize: 13 }} value={inc.name} onChange={(e) => updIncome(inc.id, { name: e.target.value })} />
            </Field>
            <Field label="Monthly Amount (₹)">
              <Num value={inc.monthlyAmount} onChange={(v) => updIncome(inc.id, { monthlyAmount: v })} prefix="₹" step={1000} />
            </Field>
            <Field label="Pre-Retirement Growth (%)">
              <Num value={inc.preRetirementGrowth} onChange={(v) => updIncome(inc.id, { preRetirementGrowth: v })} step={0.5} />
            </Field>
            <Field label="Post-Retirement Growth (%)">
              <Num value={inc.postRetirementGrowth} onChange={(v) => updIncome(inc.id, { postRetirementGrowth: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <input type="checkbox" checked={inc.hasEndDate} onChange={(e) => updIncome(inc.id, { hasEndDate: e.target.checked })} />
              Has end date
            </label>
            {inc.hasEndDate && (
              <input className="input" type="date" style={{ fontSize: 13, width: 160 }} value={inc.endDate}
                onChange={(e) => updIncome(inc.id, { endDate: e.target.value })} />
            )}
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, gap: 5, marginLeft: 'auto' }} onClick={() => removeIncome(inc.id)}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addIncome}>
        <Plus size={13} /> Add Income Stream
      </button>
    </div>
  );

  // ── Section 4: Additional Assets ──────────────────────────────────────────
  const assetKindLabels: Record<AssetKind, string> = {
    equity_mf: 'Equity MF', epf_ppf: 'EPF / PPF', nps: 'NPS', real_estate: 'Real Estate',
    gold_physical: 'Gold (Physical)', gold_sgb: 'Gold (SGB)', fd: 'Fixed Deposit', unlisted_esop: 'Unlisted / ESOP', other: 'Other',
  };
  const assetReturnDefaults: Record<AssetKind, number> = {
    equity_mf: 13, epf_ppf: 8.1, nps: 10, real_estate: 9,
    gold_physical: 8.5, gold_sgb: 8.5, fd: 7, unlisted_esop: 15, other: 8,
  };
  const addAsset = () => upd('assets', [
    ...state.assets,
    { id: uid(), kind: 'equity_mf', label: 'Mutual Funds', currentValue: 0, expectedReturn: 13, includedInCorpus: false, goalId: '', maturityDate: '', annuityPct: 40, rentalYield: 0, liquidityDate: '', haircut: 30 },
  ]);
  const removeAsset = (id: string) => upd('assets', state.assets.filter((a) => a.id !== id));
  const updAsset = (id: string, p: Partial<AdditionalAsset>) =>
    upd('assets', state.assets.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const section4 = (
    <div>
      {state.assets.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Track EPF/PPF, NPS, real estate, gold, ESOPs for a complete financial picture.
        </p>
      )}
      {state.assets.map((a) => (
        <div key={a.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 180px 160px', gap: 12, marginBottom: 10, alignItems: 'end' }}>
            <Field label="Asset Type">
              <select className="input" style={{ fontSize: 13, width: '100%' }} value={a.kind}
                onChange={(e) => {
                  const kind = e.target.value as AssetKind;
                  updAsset(a.id, { kind, expectedReturn: assetReturnDefaults[kind] });
                }}>
                {(Object.entries(assetKindLabels) as [AssetKind, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Label / Description">
              <input className="input" style={{ fontSize: 13 }} value={a.label} onChange={(e) => updAsset(a.id, { label: e.target.value })} />
            </Field>
            <Field label="Current Value (₹)">
              <Num value={a.currentValue} onChange={(v) => updAsset(a.id, { currentValue: v })} prefix="₹" step={10000} />
            </Field>
            <Field label="Expected Return (%)">
              <Num value={a.expectedReturn} onChange={(v) => updAsset(a.id, { expectedReturn: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <input type="checkbox" checked={a.includedInCorpus} onChange={(e) => updAsset(a.id, { includedInCorpus: e.target.checked })} />
              Already in corpus?
            </label>
            {a.kind === 'nps' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                Annuity %:
                <input className="input" type="number" style={{ width: 70, fontSize: 13 }} value={a.annuityPct}
                  onChange={(e) => updAsset(a.id, { annuityPct: parseFloat(e.target.value) || 40 })} min={40} max={100} step={5} />
              </label>
            )}
            {a.kind === 'unlisted_esop' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                Haircut %:
                <input className="input" type="number" style={{ width: 70, fontSize: 13 }} value={a.haircut}
                  onChange={(e) => updAsset(a.id, { haircut: parseFloat(e.target.value) || 30 })} min={0} max={80} step={5} />
              </label>
            )}
            {['epf_ppf', 'nps', 'fd'].includes(a.kind) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                Maturity:
                <input className="input" type="date" style={{ width: 150, fontSize: 13 }} value={a.maturityDate}
                  onChange={(e) => updAsset(a.id, { maturityDate: e.target.value })} />
              </label>
            )}
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, gap: 5, marginLeft: 'auto' }} onClick={() => removeAsset(a.id)}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addAsset}>
        <Plus size={13} /> Add Asset
      </button>
    </div>
  );

  // ── Section 5: Goals ──────────────────────────────────────────────────────
  const addGoal = () => upd('goals', [
    ...state.goals,
    { id: uid(), name: 'Child Education', type: 'non_negotiable', targetDate: `${new Date().getFullYear() + 10}-01-01`, presentValue: 2000000, inflationRate: 8, priority: 1, assetId: '' },
  ]);
  const removeGoal = (id: string) => upd('goals', state.goals.filter((g) => g.id !== id));
  const updGoal = (id: string, p: Partial<FinancialGoal>) =>
    upd('goals', state.goals.map((g) => (g.id === id ? { ...g, ...p } : g)));

  const section5 = (
    <div>
      {state.goals.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Add milestone goals: child's education, wedding, home purchase, world travel, etc.
        </p>
      )}
      {state.goals.map((g) => (
        <div key={g.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 160px 120px', gap: 12, marginBottom: 8, alignItems: 'end' }}>
            <Field label="Goal Name">
              <input className="input" style={{ fontSize: 13 }} value={g.name} onChange={(e) => updGoal(g.id, { name: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="input" style={{ fontSize: 13, width: '100%' }} value={g.type}
                onChange={(e) => updGoal(g.id, { type: e.target.value as FinancialGoal['type'] })}>
                <option value="non_negotiable">Non-Negotiable</option>
                <option value="flexible">Flexible</option>
                <option value="aspirational">Aspirational</option>
              </select>
            </Field>
            <Field label="Target Date">
              <input className="input" type="date" style={{ fontSize: 13, width: '100%' }} value={g.targetDate}
                onChange={(e) => updGoal(g.id, { targetDate: e.target.value })} />
            </Field>
            <Field label="Cost Today (₹)">
              <Num value={g.presentValue} onChange={(v) => updGoal(g.id, { presentValue: v })} prefix="₹" step={100000} />
            </Field>
            <Field label="Inflation (%)">
              <Num value={g.inflationRate} onChange={(v) => updGoal(g.id, { inflationRate: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, gap: 5 }} onClick={() => removeGoal(g.id)}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addGoal}>
        <Plus size={13} /> Add Goal
      </button>
    </div>
  );

  // ── Section 6: SIP Effects ────────────────────────────────────────────────
  const sipEffectLabels: Record<SIPEffectType, string> = {
    increase: 'Increase', decrease: 'Decrease', pause: 'Pause', windfall: 'Windfall (One-time)',
  };
  const addSIPEffect = () => upd('sipEffects', [
    ...state.sipEffects,
    { id: uid(), type: 'increase', startDate: `${new Date().getFullYear() + 1}-01-01`, endDate: '', amount: 5000, inflationOnAmount: 0 },
  ]);
  const removeSIPEffect = (id: string) => upd('sipEffects', state.sipEffects.filter((e) => e.id !== id));
  const updSIPEffect = (id: string, p: Partial<SIPEffect>) =>
    upd('sipEffects', state.sipEffects.map((e) => (e.id === id ? { ...e, ...p } : e)));

  const section6 = (
    <div>
      {state.sipEffects.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Model career breaks, salary hikes, bonuses, or periods when you can invest more or less.
        </p>
      )}
      {state.sipEffects.map((eff) => (
        <div key={eff.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 160px 160px auto', gap: 12, alignItems: 'end' }}>
            <Field label="Event Type">
              <select className="input" style={{ fontSize: 13, width: '100%' }} value={eff.type}
                onChange={(e) => updSIPEffect(eff.id, { type: e.target.value as SIPEffectType })}>
                {(Object.entries(sipEffectLabels) as [SIPEffectType, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            {eff.type !== 'pause' && (
              <Field label="Amount (₹/mo)">
                <Num value={eff.amount} onChange={(v) => updSIPEffect(eff.id, { amount: v })} prefix="₹" step={1000} />
              </Field>
            )}
            <Field label="Start Date">
              <input className="input" type="date" style={{ fontSize: 13, width: '100%' }} value={eff.startDate}
                onChange={(e) => updSIPEffect(eff.id, { startDate: e.target.value })} />
            </Field>
            {eff.type !== 'windfall' && (
              <Field label="End Date">
                <input className="input" type="date" style={{ fontSize: 13, width: '100%' }} value={eff.endDate}
                  onChange={(e) => updSIPEffect(eff.id, { endDate: e.target.value })} />
              </Field>
            )}
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', padding: '8px', alignSelf: 'flex-end', marginBottom: 12 }} onClick={() => removeSIPEffect(eff.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addSIPEffect}>
        <Plus size={13} /> Add Event
      </button>
    </div>
  );

  // ── Section 7: Instrument Params ──────────────────────────────────────────
  const updParams = (p: Partial<InstrumentParams>) => upd('params', { ...state.params, ...p });
  const riskProfiles: RiskProfile[] = ['very_conservative', 'conservative', 'moderate', 'aggressive', 'very_aggressive'];

  const section7 = (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label className="label" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Risk Profile Preset</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {riskProfiles.map((p) => (
            <button key={p} className="btn btn-ghost" onClick={() => upd('params', RISK_DEFAULTS[p])} style={{
              fontSize: 12, padding: '6px 14px',
              background: state.params.riskProfile === p ? 'var(--accent-blue-dim)' : undefined,
              border: state.params.riskProfile === p ? '1px solid var(--accent-blue)' : undefined,
              color: state.params.riskProfile === p ? 'var(--accent-blue)' : undefined,
            }}>
              {p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Blended Expected Return:{' '}
          <strong style={{ color: 'var(--accent-green)', fontSize: 16 }}>{blendedReturn(state.params).toFixed(1)}%</strong>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>p.a.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          <Field label="Core Equity (%)">
            <Num value={state.params.coreEquity} onChange={(v) => updParams({ coreEquity: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Hybrid (%)">
            <Num value={state.params.hybrid} onChange={(v) => updParams({ hybrid: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Debt (%)">
            <Num value={state.params.debt} onChange={(v) => updParams({ debt: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Gold (%)">
            <Num value={state.params.gold} onChange={(v) => updParams({ gold: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Real Estate (%)">
            <Num value={state.params.realEstate} onChange={(v) => updParams({ realEstate: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Inflation (%)">
            <Num value={state.params.inflation} onChange={(v) => updParams({ inflation: v })} step={0.5} min={2} max={15} />
          </Field>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
          Reference CAGRs: Nifty 50 ~13.2% · Hybrid ~11% · Debt ~7% · Gold ~8.5% · Real Estate ~9%
        </p>
      </div>
    </div>
  );

  // ── Section 8: Advanced ───────────────────────────────────────────────────
  const section8 = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
        <input type="checkbox" id="glide-path" checked={state.glidePathEnabled} onChange={(e) => upd('glidePathEnabled', e.target.checked)} style={{ marginTop: 2 }} />
        <label htmlFor="glide-path">
          <span style={{ fontWeight: 700, fontSize: 13, display: 'block' }}>Glide Path</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gradually shift from equity to debt approaching retirement</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
        <input type="checkbox" id="tax-overlay" checked={state.taxEnabled} onChange={(e) => upd('taxEnabled', e.target.checked)} style={{ marginTop: 2 }} />
        <label htmlFor="tax-overlay" style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13, display: 'block' }}>Tax Overlay</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Apply LTCG (10% above ₹1L) and income tax to returns</span>
        </label>
        {state.taxEnabled && (
          <div style={{ width: 90, flexShrink: 0 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Slab %</label>
            <Num value={state.incomeTaxSlab} onChange={(v) => upd('incomeTaxSlab', v)} step={5} min={0} max={30} />
          </div>
        )}
      </div>
      <div style={{ gridColumn: '1 / -1', padding: '12px 16px', background: 'var(--accent-blue-dim)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)', fontSize: 13 }}>
        <strong>Emergency Corpus:</strong> Based on your employment type, maintain{' '}
        <strong style={{ color: 'var(--accent-blue)' }}>{formatINR(results.emergencyCorpus)}</strong> in liquid instruments (FD / liquid funds), separate from retirement corpus.
      </div>
    </div>
  );

  // ── Results Tab ───────────────────────────────────────────────────────────

  const summaryCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
      {[
        { label: 'Projected Corpus', value: formatCompact(results.projectedCorpus), sub: formatINR(results.projectedCorpus), color: 'var(--accent-green)' },
        { label: 'Required Corpus', value: formatCompact(results.requiredCorpus), sub: formatINR(results.requiredCorpus), color: 'var(--accent-blue)' },
        {
          label: results.isShortfall ? 'Shortfall' : 'Surplus',
          value: `${results.isShortfall ? '-' : '+'}${formatCompact(Math.abs(results.shortfall))}`,
          sub: `${results.blendedReturnPct.toFixed(1)}% blended return`,
          color: results.isShortfall ? 'var(--accent-red)' : 'var(--accent-green)',
        },
        {
          label: 'P(Success) — Monte Carlo',
          value: `${mc.probabilityOfSuccess}%`,
          sub: `${mc.iterations.toLocaleString()} simulations`,
          color: mc.probabilityOfSuccess >= 80 ? 'var(--accent-green)' : mc.probabilityOfSuccess >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)',
        },
      ].map((c) => (
        <div key={c.label} className="metric-card" style={{ borderTop: `3px solid ${c.color}` }}>
          <div className="metric-label">{c.label}</div>
          <div className="metric-value" style={{ color: c.color, fontSize: 22 }}>{c.value}</div>
          <div className="metric-sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );

  const shortfallPanel = results.isShortfall ? (
    <div style={{ background: 'var(--accent-red-dim)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={15} color="var(--accent-red)" /> Shortfall Resolution
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Lumpsum Investment Today</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-gold)' }}>{formatINR(results.lumpsumNeeded)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>invest now to close the gap</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Additional Monthly SIP</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-gold)' }}>{formatINR(results.additionalSIPNeeded)}/mo</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>with {state.sipStepUpPct}% annual step-up</div>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ background: 'var(--accent-green-dim)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-md)', padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
      <CheckCircle size={16} color="var(--accent-green)" />
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-green)' }}>
        On Track — surplus of {formatCompact(Math.abs(results.shortfall))} at retirement
      </span>
    </div>
  );

  const projChart = (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Corpus Growth Projection</div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={results.yearlyProjection} margin={{ top: 5, right: 20, bottom: 0, left: 5 }}>
          <defs>
            <linearGradient id="corpusGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1e7).toFixed(0)}Cr`} width={55} />
          <Tooltip formatter={(v: number) => [formatCompact(v), 'Corpus']} labelFormatter={(l) => `Age ${l}`}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="corpus" stroke="var(--accent-green)" fill="url(#corpusGrad)" strokeWidth={2.5} dot={false} name="Corpus" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const mcChartData = mc.bands.map((b) => ({ age: b.age, p10: Math.round(b.p10), p25: Math.round(b.p25), p50: Math.round(b.p50), p75: Math.round(b.p75), p90: Math.round(b.p90) }));

  const mcChart = (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Monte Carlo Fan Chart</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {mc.iterations.toLocaleString()} simulations · shaded band = P10 to P90 range
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={mcChartData} margin={{ top: 5, right: 20, bottom: 0, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1e7).toFixed(0)}Cr`} width={55} />
          <Tooltip formatter={(v: number, name: string) => [formatCompact(v), name]} labelFormatter={(l) => `Age ${l}`}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
          <ReferenceLine y={results.requiredCorpus} stroke="var(--accent-red)" strokeDasharray="6 3"
            label={{ value: 'Required', position: 'insideTopLeft', fontSize: 11, fill: 'var(--accent-red)' }} />
          <ReferenceLine x={state.retirementAge} stroke="var(--text-muted)" strokeDasharray="4 3"
            label={{ value: 'Retire', position: 'insideTopLeft', fontSize: 11, fill: 'var(--text-muted)' }} />
          <Line type="monotone" dataKey="p90" stroke="rgba(59,130,246,0.22)" strokeWidth={1} dot={false} name="P90 (Best)" />
          <Line type="monotone" dataKey="p75" stroke="rgba(59,130,246,0.45)" strokeWidth={1.5} dot={false} name="P75" />
          <Line type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="P50 Median" />
          <Line type="monotone" dataKey="p25" stroke="rgba(59,130,246,0.45)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="P25" />
          <Line type="monotone" dataKey="p10" stroke="rgba(59,130,246,0.22)" strokeWidth={1} dot={false} strokeDasharray="3 2" name="P10 (Worst)" />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const bucketsPanel = (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Retirement Bucket Strategy</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Liquid Bucket', sub: 'Yrs 1–2 · FD / Savings', value: results.retirementBuckets.liquid, color: 'var(--accent-blue)' },
          { label: 'Conservative', sub: 'Yrs 3–7 · Debt Funds', value: results.retirementBuckets.conservative, color: 'var(--accent-gold)' },
          { label: 'Growth Bucket', sub: 'Yr 8+ · Equity', value: Math.max(0, results.retirementBuckets.growth), color: 'var(--accent-green)' },
        ].map((b) => (
          <div key={b.label} style={{ textAlign: 'center', padding: '16px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', borderTop: `3px solid ${b.color}` }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{b.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: b.color }}>{formatCompact(b.value)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{b.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const sensitivityTable = (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Return Sensitivity Analysis</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Return Rate', 'Projected Corpus', 'Required Corpus', 'Result'].map((h, i) => (
              <th key={h} style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.sensitivityRows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: row.returnDelta === 0 ? 'var(--bg-elevated)' : undefined }}>
              <td style={{ padding: '10px 12px', fontWeight: row.returnDelta === 0 ? 700 : 400 }}>
                {results.blendedReturnPct.toFixed(1)}{row.returnDelta !== 0 ? (row.returnDelta > 0 ? `+${row.returnDelta}` : `${row.returnDelta}`) : ' (base)'}%
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent-green)' }}>{formatCompact(row.projectedCorpus)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent-blue)' }}>{formatCompact(row.requiredCorpus)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.shortfall > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {row.shortfall > 0 ? `-${formatCompact(row.shortfall)}` : 'Surplus ✓'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const goalsTable = results.goalStatuses.length > 0 ? (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Goal Tracker</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Goal', 'Target Year', 'FV (inflation-adj)', 'Corpus at Date', 'Status'].map((h, i) => (
              <th key={h} style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, textAlign: i <= 1 ? 'left' : i === 4 ? 'center' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.goalStatuses.map((gs, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600 }}>{gs.goal.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{gs.goal.type.replace(/_/g, ' ')}</div>
              </td>
              <td style={{ padding: '10px 12px' }}>{gs.goal.targetDate.slice(0, 4)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCompact(gs.futureValue)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCompact(gs.projectedAvailability)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: gs.status === 'on_track' ? 'var(--accent-green-dim)' : gs.status === 'at_risk' ? 'var(--accent-gold-dim)' : 'var(--accent-red-dim)',
                  color: gs.status === 'on_track' ? 'var(--accent-green)' : gs.status === 'at_risk' ? 'var(--accent-gold)' : 'var(--accent-red)',
                }}>
                  {gs.status === 'on_track' ? 'On Track' : gs.status === 'at_risk' ? 'At Risk' : 'Shortfall'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  // ── Sticky Bottom Bar ─────────────────────────────────────────────────────
  const stickyBar = (
    <div style={{
      position: 'fixed', bottom: 0, left: 'var(--sidebar-width)', right: 0,
      background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
      padding: '9px 28px', display: 'flex', alignItems: 'center', gap: 20,
      zIndex: 100, boxShadow: '0 -4px 24px rgba(0,0,0,0.35)',
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}>LIVE</span>
      <div style={{ display: 'flex', gap: 28, flex: 1 }}>
        {[
          { label: 'Projected', val: formatCompact(results.projectedCorpus), color: 'var(--accent-green)' },
          { label: 'Required', val: formatCompact(results.requiredCorpus), color: 'var(--accent-blue)' },
          { label: results.isShortfall ? 'Shortfall' : 'Surplus', val: `${results.isShortfall ? '-' : '+'}${formatCompact(Math.abs(results.shortfall))}`, color: results.isShortfall ? 'var(--accent-red)' : 'var(--accent-green)' },
          { label: 'P(Success)', val: `${mc.probabilityOfSuccess}%`, color: mc.probabilityOfSuccess >= 80 ? 'var(--accent-green)' : mc.probabilityOfSuccess >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)' },
          { label: 'Return', val: `${results.blendedReturnPct.toFixed(1)}% p.a.`, color: 'var(--text-primary)' },
        ].map((item) => (
          <span key={item.label}>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 1 }}>{item.label}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: item.color }}>{item.val}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('results')}>
          View Results →
        </button>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '5px 14px', opacity: exporting ? 0.7 : 1 }}
          onClick={triggerExport}
          disabled={exporting}
        >
          <Download size={12} style={{ marginRight: 5 }} />
          {exporting ? 'Generating PDF…' : 'Export PDF'}
        </button>
      </div>
    </div>
  );

  // ── Section 9: Loans ─────────────────────────────────────────────────────
  function calcEMI(p: number, annualRate: number, months: number): number {
    if (months <= 0 || p <= 0) return 0;
    if (annualRate === 0) return p / months;
    const r = annualRate / 100 / 12;
    return (p * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  const addLoan = () => upd('loans', [
    ...(state.loans ?? []),
    { id: uid(), name: 'Home Loan', outstandingBalance: 5000000, interestRate: 8.5, remainingTenureMonths: 240, emiOverride: 0 },
  ]);
  const removeLoan = (id: string) => upd('loans', (state.loans ?? []).filter((l) => l.id !== id));
  const updLoan = (id: string, p: Partial<LoanEntry>) =>
    upd('loans', (state.loans ?? []).map((l) => (l.id === id ? { ...l, ...p } : l)));

  const section9 = (
    <div>
      {(!state.loans || state.loans.length === 0) && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Track all active loans — home, car, personal, or business — to understand your total liability.
        </p>
      )}
      {(state.loans ?? []).map((loan) => {
        const emi = loan.emiOverride > 0
          ? loan.emiOverride
          : calcEMI(loan.outstandingBalance, loan.interestRate, loan.remainingTenureMonths);
        const totalOutgo = emi * loan.remainingTenureMonths;
        const interestOutgo = totalOutgo - loan.outstandingBalance;
        return (
          <div key={loan.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 160px 180px', gap: 12, marginBottom: 12, alignItems: 'end' }}>
              <Field label="Loan Description">
                <input className="input" style={{ fontSize: 13 }} value={loan.name} onChange={(e) => updLoan(loan.id, { name: e.target.value })} />
              </Field>
              <Field label="Outstanding Balance (₹)">
                <Num value={loan.outstandingBalance} onChange={(v) => updLoan(loan.id, { outstandingBalance: v })} prefix="₹" step={100000} />
              </Field>
              <Field label="Interest Rate (% p.a.)">
                <Num value={loan.interestRate} onChange={(v) => updLoan(loan.id, { interestRate: v })} step={0.25} min={0} max={36} />
              </Field>
              <Field label="Remaining Tenure (months)">
                <Num value={loan.remainingTenureMonths} onChange={(v) => updLoan(loan.id, { remainingTenureMonths: Math.round(v) })} step={12} min={1} max={360} />
              </Field>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>EMI override (₹)</span>
                <input className="input" type="number" style={{ width: 120, fontSize: 13 }} value={loan.emiOverride || ''}
                  placeholder="auto" onChange={(e) => updLoan(loan.id, { emiOverride: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Monthly EMI</span>
                  <strong style={{ color: 'var(--accent-blue)' }}>{formatINR(emi)}</strong>
                </span>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Total Interest</span>
                  <strong style={{ color: 'var(--accent-red)' }}>{formatINR(interestOutgo)}</strong>
                </span>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Total Outgo</span>
                  <strong>{formatINR(totalOutgo)}</strong>
                </span>
                <span style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Closes in</span>
                  <strong>{loan.remainingTenureMonths >= 12 ? `${Math.floor(loan.remainingTenureMonths / 12)}y ${loan.remainingTenureMonths % 12}m` : `${loan.remainingTenureMonths}m`}</strong>
                </span>
              </div>
              <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, gap: 5, marginLeft: 'auto' }} onClick={() => removeLoan(loan.id)}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </div>
        );
      })}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addLoan}>
        <Plus size={13} /> Add Loan
      </button>
    </div>
  );

  // ── Section 10: Consolidated Returns ──────────────────────────────────────
  const sipRows = [
    { label: 'Core Equity (Nifty / Large Cap)', alloc: state.params.coreEquity, impliedReturn: INSTRUMENT_RETURNS.coreEquity },
    { label: 'Hybrid / Balanced Funds', alloc: state.params.hybrid, impliedReturn: INSTRUMENT_RETURNS.hybrid },
    { label: 'Debt / Bond Funds', alloc: state.params.debt, impliedReturn: INSTRUMENT_RETURNS.debt },
    { label: 'Gold', alloc: state.params.gold, impliedReturn: INSTRUMENT_RETURNS.gold },
    { label: 'Real Estate (REIT / Direct)', alloc: state.params.realEstate, impliedReturn: INSTRUMENT_RETURNS.realEstate },
  ].filter((r) => r.alloc > 0);

  const section10 = (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        A single view of all asset return assumptions. Edit additional asset returns here — they sync back to Section 4.
        Adjust SIP instrument allocations in Section 7.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Asset / Instrument', 'Type', 'Allocation / Value', 'Reference Return (% p.a.)', 'Your Override'].map((h, i) => (
              <th key={h} style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11.5, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* SIP portfolio rows (read-only returns, allocation from Section 7) */}
          {sipRows.map(({ label, alloc, impliedReturn }) => (
            <tr key={label} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(59,92,242,0.03)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{label}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>SIP Portfolio</span>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{alloc}% of portfolio</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent-green)', fontWeight: 700 }}>{impliedReturn}%</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>
                Edit in Section 7
              </td>
            </tr>
          ))}
          {/* Blended SIP return summary */}
          {sipRows.length > 0 && (
            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 700 }} colSpan={3}>Blended SIP Return</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-green)', fontSize: 15 }} colSpan={2}>
                {blendedReturn(state.params).toFixed(2)}%
              </td>
            </tr>
          )}
          {/* Additional assets (editable) */}
          {state.assets.map((a) => (
            <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{a.label}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                <span className="badge badge-gray" style={{ fontSize: 10 }}>{a.kind.replace(/_/g, ' ')}</span>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{formatINR(a.currentValue)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <input
                  className="input"
                  type="number"
                  style={{ width: 90, fontSize: 13, textAlign: 'right' }}
                  value={a.expectedReturn}
                  step={0.5}
                  onChange={(e) => updAsset(a.id, { expectedReturn: parseFloat(e.target.value) || 0 })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.assets.length === 0 && sipRows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>Configure Section 4 or Section 7 to see assets here.</p>
      )}
    </div>
  );

  // ── Section definitions ───────────────────────────────────────────────────
  const sections = [
    { title: 'Basic Information', subtitle: 'Age, corpus, SIP, and retirement timeline', icon: '1', content: section1 },
    { title: 'Living Expenses', subtitle: 'Post-retirement spending streams with inflation', icon: '2', content: section2 },
    { title: 'Passive Income', subtitle: 'Rental, pension, dividends — income in retirement', icon: '3', content: section3 },
    { title: 'Additional Assets', subtitle: 'EPF, NPS, real estate, gold, ESOPs', icon: '4', content: section4 },
    { title: 'Financial Goals', subtitle: 'Milestone withdrawals (education, wedding, home)', icon: '5', content: section5 },
    { title: 'SIP Capacity Events', subtitle: 'Career breaks, windfalls, and salary hikes', icon: '6', content: section6 },
    { title: 'Instrument Parameters', subtitle: 'Asset allocation and return assumptions', icon: '7', content: section7 },
    { title: 'Advanced Options', subtitle: 'Glide path, tax overlay, emergency corpus', icon: '8', content: section8 },
    { title: 'Loan Planning', subtitle: 'EMI, interest burden, and payoff timeline for all loans', icon: '9', content: section9 },
    { title: 'Consolidated Returns', subtitle: 'Edit expected returns for all assets in one place', icon: '↗', content: section10 },
  ];

  // ── Tab Bar ───────────────────────────────────────────────────────────────
  const tabBar = (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      {[
        { id: 'configure', label: 'Configure', icon: <Settings size={14} /> },
        { id: 'results', label: 'Results & Analysis', icon: <BarChart2 size={14} /> },
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id as typeof tab)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: tab === t.id ? 'var(--accent-blue)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
            marginBottom: -1,
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="page" style={{ paddingBottom: 72 }}>
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Retirement Planner</h1>
            <p className="page-subtitle">Comprehensive retirement analysis · auto-saved · {mc.iterations.toLocaleString()} Monte Carlo simulations</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={handleImport}>
              <Upload size={14} style={{ marginRight: 5 }} /> Import JSON
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, opacity: exporting ? 0.7 : 1 }}
              onClick={triggerExport}
              disabled={exporting}
            >
              <Download size={14} style={{ marginRight: 5 }} />
              {exporting ? 'Generating…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {tabBar}

        {tab === 'configure' && (
          <div style={{ maxWidth: 860 }}>
            {sections.map((s, i) => (
              <Section key={i} title={s.title} subtitle={s.subtitle} icon={s.icon} open={openSections.has(i)} onToggle={() => toggleSection(i)}>
                {s.content}
              </Section>
            ))}
          </div>
        )}

        {tab === 'results' && (
          <div>
            {summaryCards}
            {shortfallPanel}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                {projChart}
                {bucketsPanel}
                {sensitivityTable}
              </div>
              <div>
                {mcChart}
                {goalsTable}
              </div>
            </div>
          </div>
        )}
      </div>

      {stickyBar}

      {/* Client Picker Modal */}
      {showClientPicker && (
        <div className="modal-overlay" onClick={() => setShowClientPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={16} /> Export PDF for Client
              </h2>
              <button className="btn-icon" onClick={() => setShowClientPicker(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Optionally select a client to personalise the report. You can also export without selecting one.
              </p>
              <div className="field" style={{ marginBottom: 16 }}>
                <label className="label">Search client</label>
                <input
                  className="input"
                  placeholder="Type a name…"
                  value={clientSearch}
                  autoFocus
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                {clientList
                  .filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedClient(c); setClientSearch(c.name); }}
                      style={{
                        display: 'flex', flexDirection: 'column', width: '100%',
                        padding: '10px 14px', background: selectedClient?.id === c.id ? 'var(--accent-blue-dim)' : 'none',
                        border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                        textAlign: 'left', color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                      {c.email && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{c.email}</span>}
                    </button>
                  ))}
                {clientList.filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                  <p style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No clients found.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => handleExportPDF(null)}>
                Export without client
              </button>
              <button
                className="btn btn-primary"
                disabled={!selectedClient || exporting}
                onClick={() => handleExportPDF(selectedClient)}
              >
                <Download size={13} style={{ marginRight: 5 }} />
                {exporting ? 'Generating…' : `Export for ${selectedClient?.name ?? '—'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
