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
  DEFAULT_STATE, RISK_DEFAULTS,
  type PlannerState, type ExpenseStream, type IncomeStream,
  type AdditionalAsset, type FinancialGoal, type SIPEffect,
  type InstrumentParams, type RiskProfile, type AssetKind, type SIPEffectType,
} from '@/lib/financialPlanning';
import {
  ChevronDown, ChevronUp, Plus, Trash2, Download, Upload, AlertTriangle, CheckCircle,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
          padding: '13px 16px', background: open ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left',
        }}
      >
        <span style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-blue-dim)',
          color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{icon}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</span>
        </span>
        {open ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
      </button>
      {open && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <label className="label" style={{ fontSize: 12 }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>{hint}</span>}
    </div>
  );
}

function NumInput({ value, onChange, min, max, step, prefix }: {
  value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; prefix?: string;
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {prefix && (
        <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', fontSize: 12, pointerEvents: 'none', zIndex: 1 }}>{prefix}</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [state, setState] = useState<PlannerState>(loadFromLS);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

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

  // ── Export / Import ────────────────────────────────────────────────────────
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aurum-plan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
          const parsed = JSON.parse(e.target?.result as string);
          setState({ ...DEFAULT_STATE, ...parsed });
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    inp.click();
  };

  const handleReset = () => {
    if (confirm('Reset all inputs to defaults?')) setState(DEFAULT_STATE);
  };

  // ── Section 1: Basic Info ──────────────────────────────────────────────────
  const section1 = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      <Field label="Current Age">
        <NumInput value={state.currentAge} onChange={(v) => upd('currentAge', v)} min={18} max={80} />
      </Field>
      <Field label="Retirement Age">
        <NumInput value={state.retirementAge} onChange={(v) => upd('retirementAge', v)} min={40} max={80} />
      </Field>
      <Field label="Life Expectancy">
        <NumInput value={state.lifeExpectancy} onChange={(v) => upd('lifeExpectancy', v)} min={60} max={100} />
      </Field>
      <Field label="Employment Type">
        <select
          className="input"
          value={state.employmentType}
          onChange={(e) => upd('employmentType', e.target.value as PlannerState['employmentType'])}
          style={{ fontSize: 13 }}
        >
          <option value="salaried">Salaried</option>
          <option value="self_employed">Self-Employed</option>
          <option value="business">Business Owner</option>
        </select>
      </Field>
      <Field label="Current Corpus (₹)">
        <NumInput value={state.currentCorpus} onChange={(v) => upd('currentCorpus', v)} prefix="₹" step={100000} />
      </Field>
      <Field label="Monthly SIP (₹)">
        <NumInput value={state.monthlySIP} onChange={(v) => upd('monthlySIP', v)} prefix="₹" step={1000} />
      </Field>
      <Field label="SIP Annual Step-up (%)" hint="% increase each year">
        <NumInput value={state.sipStepUpPct} onChange={(v) => upd('sipStepUpPct', v)} step={0.5} min={0} max={30} />
      </Field>
      <Field label="Target Override (₹)" hint="0 = auto-compute">
        <NumInput value={state.targetCorpusOverride} onChange={(v) => upd('targetCorpusOverride', v)} prefix="₹" step={100000} />
      </Field>
    </div>
  );

  // ── Section 2: Expenses ────────────────────────────────────────────────────
  const addExpense = () => {
    const e: ExpenseStream = {
      id: uid(), name: 'Living Expenses', monthlyAmount: 50000,
      inflationRate: 6, stepUpAfterRetirement: false, adjustments: [],
    };
    upd('expenses', [...state.expenses, e]);
  };
  const removeExpense = (id: string) => upd('expenses', state.expenses.filter((e) => e.id !== id));
  const updExpense = (id: string, patch: Partial<ExpenseStream>) =>
    upd('expenses', state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const section2 = (
    <div>
      {state.expenses.map((e) => (
        <div key={e.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px auto', gap: 8, alignItems: 'end' }}>
            <Field label="Description">
              <input className="input" style={{ fontSize: 13 }} value={e.name} onChange={(ev) => updExpense(e.id, { name: ev.target.value })} />
            </Field>
            <Field label="Monthly (₹)">
              <NumInput value={e.monthlyAmount} onChange={(v) => updExpense(e.id, { monthlyAmount: v })} prefix="₹" step={1000} />
            </Field>
            <Field label="Inflation (%)">
              <NumInput value={e.inflationRate} onChange={(v) => updExpense(e.id, { inflationRate: v })} step={0.5} />
            </Field>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--accent-red)', padding: '8px 8px', alignSelf: 'center', marginTop: 16 }}
              onClick={() => removeExpense(e.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addExpense}>
        <Plus size={13} /> Add Expense
      </button>
    </div>
  );

  // ── Section 3: Passive Income ──────────────────────────────────────────────
  const addIncome = () => {
    const i: IncomeStream = {
      id: uid(), name: 'Rental Income', monthlyAmount: 0,
      preRetirementGrowth: 5, postRetirementGrowth: 3, hasEndDate: false, endDate: '',
    };
    upd('incomeStreams', [...state.incomeStreams, i]);
  };
  const removeIncome = (id: string) => upd('incomeStreams', state.incomeStreams.filter((i) => i.id !== id));
  const updIncome = (id: string, patch: Partial<IncomeStream>) =>
    upd('incomeStreams', state.incomeStreams.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const section3 = (
    <div>
      {state.incomeStreams.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
          Add rental income, pension, dividends, or any income continuing into retirement.
        </p>
      )}
      {state.incomeStreams.map((inc) => (
        <div key={inc.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px', gap: 8, alignItems: 'end' }}>
            <Field label="Source">
              <input className="input" style={{ fontSize: 13 }} value={inc.name} onChange={(e) => updIncome(inc.id, { name: e.target.value })} />
            </Field>
            <Field label="Monthly (₹)">
              <NumInput value={inc.monthlyAmount} onChange={(v) => updIncome(inc.id, { monthlyAmount: v })} prefix="₹" step={1000} />
            </Field>
            <Field label="Pre-Ret Growth (%)">
              <NumInput value={inc.preRetirementGrowth} onChange={(v) => updIncome(inc.id, { preRetirementGrowth: v })} step={0.5} />
            </Field>
            <Field label="Post-Ret Growth (%)">
              <NumInput value={inc.postRetirementGrowth} onChange={(v) => updIncome(inc.id, { postRetirementGrowth: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={inc.hasEndDate}
                onChange={(e) => updIncome(inc.id, { hasEndDate: e.target.checked })}
              />
              Has end date
            </label>
            {inc.hasEndDate && (
              <input className="input" type="date" style={{ fontSize: 12, width: 150 }} value={inc.endDate} onChange={(e) => updIncome(inc.id, { endDate: e.target.value })} />
            )}
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, marginLeft: 'auto', gap: 4 }} onClick={() => removeIncome(inc.id)}>
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addIncome}>
        <Plus size={13} /> Add Income Stream
      </button>
    </div>
  );

  // ── Section 4: Additional Assets ───────────────────────────────────────────
  const addAsset = () => {
    const a: AdditionalAsset = {
      id: uid(), kind: 'equity_mf', label: 'Mutual Funds', currentValue: 0,
      expectedReturn: 13, includedInCorpus: false, goalId: '', maturityDate: '',
      annuityPct: 40, rentalYield: 0, liquidityDate: '', haircut: 30,
    };
    upd('assets', [...state.assets, a]);
  };
  const removeAsset = (id: string) => upd('assets', state.assets.filter((a) => a.id !== id));
  const updAsset = (id: string, patch: Partial<AdditionalAsset>) =>
    upd('assets', state.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const assetKindLabels: Record<AssetKind, string> = {
    equity_mf: 'Equity MF', epf_ppf: 'EPF / PPF', nps: 'NPS',
    real_estate: 'Real Estate', gold_physical: 'Gold (Physical)',
    gold_sgb: 'Gold (SGB)', fd: 'Fixed Deposit', unlisted_esop: 'Unlisted / ESOP', other: 'Other',
  };
  const assetReturnDefaults: Record<AssetKind, number> = {
    equity_mf: 13, epf_ppf: 8.1, nps: 10, real_estate: 9,
    gold_physical: 8.5, gold_sgb: 8.5, fd: 7, unlisted_esop: 15, other: 8,
  };

  const section4 = (
    <div>
      {state.assets.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
          Track EPF/PPF, NPS, real estate, gold, ESOPs, etc. for a complete picture.
        </p>
      )}
      {state.assets.map((a) => (
        <div key={a.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px 110px', gap: 8, alignItems: 'end' }}>
            <Field label="Type">
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={a.kind}
                onChange={(e) => {
                  const kind = e.target.value as AssetKind;
                  updAsset(a.id, { kind, expectedReturn: assetReturnDefaults[kind] });
                }}
              >
                {(Object.entries(assetKindLabels) as [AssetKind, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Label">
              <input className="input" style={{ fontSize: 13 }} value={a.label} onChange={(e) => updAsset(a.id, { label: e.target.value })} />
            </Field>
            <Field label="Current Value (₹)">
              <NumInput value={a.currentValue} onChange={(v) => updAsset(a.id, { currentValue: v })} prefix="₹" step={10000} />
            </Field>
            <Field label="Expected Return (%)">
              <NumInput value={a.expectedReturn} onChange={(v) => updAsset(a.id, { expectedReturn: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={a.includedInCorpus}
                onChange={(e) => updAsset(a.id, { includedInCorpus: e.target.checked })}
              />
              Already in corpus?
            </label>
            {a.kind === 'nps' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Annuity %:
                <input
                  className="input"
                  type="number"
                  style={{ width: 70, fontSize: 12 }}
                  value={a.annuityPct}
                  onChange={(e) => updAsset(a.id, { annuityPct: parseFloat(e.target.value) || 40 })}
                  min={40} max={100} step={5}
                />
              </label>
            )}
            {a.kind === 'unlisted_esop' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Haircut %:
                <input
                  className="input"
                  type="number"
                  style={{ width: 70, fontSize: 12 }}
                  value={a.haircut}
                  onChange={(e) => updAsset(a.id, { haircut: parseFloat(e.target.value) || 30 })}
                  min={0} max={80} step={5}
                />
              </label>
            )}
            {['epf_ppf', 'nps', 'fd'].includes(a.kind) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Maturity:
                <input
                  className="input"
                  type="date"
                  style={{ width: 140, fontSize: 12 }}
                  value={a.maturityDate}
                  onChange={(e) => updAsset(a.id, { maturityDate: e.target.value })}
                />
              </label>
            )}
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, marginLeft: 'auto', gap: 4 }} onClick={() => removeAsset(a.id)}>
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addAsset}>
        <Plus size={13} /> Add Asset
      </button>
    </div>
  );

  // ── Section 5: Goals ───────────────────────────────────────────────────────
  const addGoal = () => {
    const g: FinancialGoal = {
      id: uid(), name: 'Child Education', type: 'non_negotiable',
      targetDate: `${new Date().getFullYear() + 10}-01-01`,
      presentValue: 2000000, inflationRate: 8, priority: 1, assetId: '',
    };
    upd('goals', [...state.goals, g]);
  };
  const removeGoal = (id: string) => upd('goals', state.goals.filter((g) => g.id !== id));
  const updGoal = (id: string, patch: Partial<FinancialGoal>) =>
    upd('goals', state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const section5 = (
    <div>
      {state.goals.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
          Add milestone goals: child education, wedding, home purchase, travel, etc.
        </p>
      )}
      {state.goals.map((g) => (
        <div key={g.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 100px 80px', gap: 8, alignItems: 'end' }}>
            <Field label="Goal Name">
              <input className="input" style={{ fontSize: 13 }} value={g.name} onChange={(e) => updGoal(g.id, { name: e.target.value })} />
            </Field>
            <Field label="Type">
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={g.type}
                onChange={(e) => updGoal(g.id, { type: e.target.value as FinancialGoal['type'] })}
              >
                <option value="non_negotiable">Non-Negotiable</option>
                <option value="flexible">Flexible</option>
                <option value="aspirational">Aspirational</option>
              </select>
            </Field>
            <Field label="Target Date">
              <input className="input" type="date" style={{ fontSize: 12 }} value={g.targetDate} onChange={(e) => updGoal(g.id, { targetDate: e.target.value })} />
            </Field>
            <Field label="Today's Cost (₹)">
              <NumInput value={g.presentValue} onChange={(v) => updGoal(g.id, { presentValue: v })} prefix="₹" step={100000} />
            </Field>
            <Field label="Inflation (%)">
              <NumInput value={g.inflationRate} onChange={(v) => updGoal(g.id, { inflationRate: v })} step={0.5} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn btn-ghost" style={{ color: 'var(--accent-red)', fontSize: 12, gap: 4 }} onClick={() => removeGoal(g.id)}>
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={addGoal}>
        <Plus size={13} /> Add Goal
      </button>
    </div>
  );

  // ── Section 6: SIP Effects ─────────────────────────────────────────────────
  const addSIPEffect = () => {
    const e: SIPEffect = {
      id: uid(), type: 'increase',
      startDate: `${new Date().getFullYear() + 1}-01-01`, endDate: '',
      amount: 5000, inflationOnAmount: 0,
    };
    upd('sipEffects', [...state.sipEffects, e]);
  };
  const removeSIPEffect = (id: string) => upd('sipEffects', state.sipEffects.filter((e) => e.id !== id));
  const updSIPEffect = (id: string, patch: Partial<SIPEffect>) =>
    upd('sipEffects', state.sipEffects.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const sipEffectLabels: Record<SIPEffectType, string> = {
    increase: 'Increase', decrease: 'Decrease', pause: 'Pause', windfall: 'Windfall (One-time)',
  };

  const section6 = (
    <div>
      {state.sipEffects.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
          Model career breaks, salary hikes, windfalls, or any period of changed investment capacity.
        </p>
      )}
      {state.sipEffects.map((eff) => (
        <div key={eff.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 130px 130px auto', gap: 8, alignItems: 'end' }}>
            <Field label="Event Type">
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={eff.type}
                onChange={(e) => updSIPEffect(eff.id, { type: e.target.value as SIPEffectType })}
              >
                {(Object.entries(sipEffectLabels) as [SIPEffectType, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            {eff.type !== 'pause' && (
              <Field label="Amount (₹/mo)">
                <NumInput value={eff.amount} onChange={(v) => updSIPEffect(eff.id, { amount: v })} prefix="₹" step={1000} />
              </Field>
            )}
            <Field label="Start Date">
              <input className="input" type="date" style={{ fontSize: 12 }} value={eff.startDate} onChange={(e) => updSIPEffect(eff.id, { startDate: e.target.value })} />
            </Field>
            {eff.type !== 'windfall' && (
              <Field label="End Date">
                <input className="input" type="date" style={{ fontSize: 12 }} value={eff.endDate} onChange={(e) => updSIPEffect(eff.id, { endDate: e.target.value })} />
              </Field>
            )}
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--accent-red)', padding: '8px 8px', alignSelf: 'center', marginTop: 16 }}
              onClick={() => removeSIPEffect(eff.id)}
            >
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

  // ── Section 7: Instrument Params ───────────────────────────────────────────
  const updParams = (patch: Partial<InstrumentParams>) =>
    upd('params', { ...state.params, ...patch });

  const riskProfiles: RiskProfile[] = ['very_conservative', 'conservative', 'moderate', 'aggressive', 'very_aggressive'];

  const section7 = (
    <div>
      <Field label="Risk Profile">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {riskProfiles.map((p) => (
            <button
              key={p}
              className="btn btn-ghost"
              style={{
                fontSize: 11, padding: '5px 10px',
                background: state.params.riskProfile === p ? 'var(--accent-blue-dim)' : undefined,
                border: state.params.riskProfile === p ? '1px solid var(--accent-blue)' : undefined,
                color: state.params.riskProfile === p ? 'var(--accent-blue)' : undefined,
              }}
              onClick={() => upd('params', RISK_DEFAULTS[p])}
            >
              {p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Blended Expected Return:{' '}
          <strong style={{ color: 'var(--accent-green)', fontSize: 15 }}>{blendedReturn(state.params).toFixed(1)}%</strong>
          <span style={{ marginLeft: 8, fontSize: 11 }}>p.a.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field label="Core Equity (%)">
            <NumInput value={state.params.coreEquity} onChange={(v) => updParams({ coreEquity: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Hybrid / Balanced (%)">
            <NumInput value={state.params.hybrid} onChange={(v) => updParams({ hybrid: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Debt / Bonds (%)">
            <NumInput value={state.params.debt} onChange={(v) => updParams({ debt: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Gold (%)">
            <NumInput value={state.params.gold} onChange={(v) => updParams({ gold: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Real Estate (%)">
            <NumInput value={state.params.realEstate} onChange={(v) => updParams({ realEstate: v })} step={5} min={0} max={100} />
          </Field>
          <Field label="Inflation (%)">
            <NumInput value={state.params.inflation} onChange={(v) => updParams({ inflation: v })} step={0.5} min={2} max={15} />
          </Field>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
          Reference CAGRs: Nifty 50 ~13.2% · Hybrid ~11% · Debt ~7% · Gold ~8.5% · Real Estate ~9%
        </p>
      </div>
    </div>
  );

  // ── Section 8: Advanced ────────────────────────────────────────────────────
  const section8 = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
        <input type="checkbox" id="glide-path" checked={state.glidePathEnabled} onChange={(e) => upd('glidePathEnabled', e.target.checked)} style={{ marginTop: 3 }} />
        <label htmlFor="glide-path">
          <span style={{ fontWeight: 600, fontSize: 13, display: 'block' }}>Glide Path</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gradually shift from equity to debt as you approach retirement</span>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
        <input type="checkbox" id="tax-overlay" checked={state.taxEnabled} onChange={(e) => upd('taxEnabled', e.target.checked)} style={{ marginTop: 3 }} />
        <label htmlFor="tax-overlay" style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 13, display: 'block' }}>Tax Overlay</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Apply LTCG (10% above ₹1L) and income tax to investment returns</span>
        </label>
        {state.taxEnabled && (
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tax Slab (%)</label>
            <NumInput value={state.incomeTaxSlab} onChange={(v) => upd('incomeTaxSlab', v)} step={5} min={0} max={30} />
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px', background: 'var(--accent-blue-dim)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          <strong>Emergency Corpus:</strong> For your employment type, maintain{' '}
          <strong>{formatINR(results.emergencyCorpus)}</strong> in liquid instruments (FD / liquid funds), separate from retirement corpus.
        </p>
      </div>
    </div>
  );

  // ── Results Panel ──────────────────────────────────────────────────────────
  const summaryCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
      <div className="metric-card" style={{ borderLeft: '3px solid var(--accent-green)' }}>
        <div className="metric-label">Projected Corpus</div>
        <div className="metric-value" style={{ color: 'var(--accent-green)', fontSize: 19 }}>{formatCompact(results.projectedCorpus)}</div>
        <div className="metric-sub">{formatINR(results.projectedCorpus)}</div>
      </div>
      <div className="metric-card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
        <div className="metric-label">Required Corpus</div>
        <div className="metric-value" style={{ color: 'var(--accent-blue)', fontSize: 19 }}>{formatCompact(results.requiredCorpus)}</div>
        <div className="metric-sub">{formatINR(results.requiredCorpus)}</div>
      </div>
      <div className="metric-card" style={{ borderLeft: `3px solid ${results.isShortfall ? 'var(--accent-red)' : 'var(--accent-green)'}` }}>
        <div className="metric-label">{results.isShortfall ? 'Shortfall' : 'Surplus'}</div>
        <div className="metric-value" style={{ color: results.isShortfall ? 'var(--accent-red)' : 'var(--accent-green)', fontSize: 19 }}>
          {results.isShortfall ? '-' : '+'}{formatCompact(Math.abs(results.shortfall))}
        </div>
        <div className="metric-sub">{results.blendedReturnPct.toFixed(1)}% blended return</div>
      </div>
      <div className="metric-card" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
        <div className="metric-label">P(Success)</div>
        <div
          className="metric-value"
          style={{
            color: mc.probabilityOfSuccess >= 80 ? 'var(--accent-green)' : mc.probabilityOfSuccess >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)',
            fontSize: 19,
          }}
        >
          {mc.probabilityOfSuccess}%
        </div>
        <div className="metric-sub">Monte Carlo · {mc.iterations.toLocaleString()} runs</div>
      </div>
    </div>
  );

  const shortfallPanel = results.isShortfall ? (
    <div style={{ background: 'var(--accent-red-dim)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
        <AlertTriangle size={14} color="var(--accent-red)" /> Shortfall Resolution
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Lumpsum Today</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-gold)' }}>{formatINR(results.lumpsumNeeded)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Additional Monthly SIP</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-gold)' }}>{formatINR(results.additionalSIPNeeded)}/mo</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>with {state.sipStepUpPct}% annual step-up</div>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ background: 'var(--accent-green-dim)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
      <CheckCircle size={15} color="var(--accent-green)" />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-green)' }}>
        On Track — surplus of {formatCompact(Math.abs(results.shortfall))} at retirement
      </span>
    </div>
  );

  const projChart = (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Corpus Growth Projection</div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={results.yearlyProjection} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="corpusGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1e7).toFixed(0)}Cr`} width={50} />
          <Tooltip
            formatter={(v: number) => [formatCompact(v), 'Corpus']}
            labelFormatter={(l) => `Age ${l}`}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="corpus" stroke="var(--accent-green)" fill="url(#corpusGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const mcChartData = mc.bands.map((b) => ({
    age: b.age,
    p10: Math.round(b.p10),
    p25: Math.round(b.p25),
    p50: Math.round(b.p50),
    p75: Math.round(b.p75),
    p90: Math.round(b.p90),
  }));

  const mcChart = (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Monte Carlo Fan Chart</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={mcChartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
          <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1e7).toFixed(0)}Cr`} width={50} />
          <Tooltip
            formatter={(v: number, name: string) => [formatCompact(v), name]}
            labelFormatter={(l) => `Age ${l}`}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          />
          <ReferenceLine y={results.requiredCorpus} stroke="var(--accent-red)" strokeDasharray="5 3" label={{ value: 'Required', position: 'insideTopLeft', fontSize: 10, fill: 'var(--accent-red)' }} />
          <ReferenceLine x={state.retirementAge} stroke="var(--text-muted)" strokeDasharray="4 3" label={{ value: 'Retire', position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)' }} />
          <Line type="monotone" dataKey="p90" stroke="rgba(59,130,246,0.25)" strokeWidth={1} dot={false} name="P90 Best" />
          <Line type="monotone" dataKey="p75" stroke="rgba(59,130,246,0.45)" strokeWidth={1.5} dot={false} name="P75" />
          <Line type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="P50 Median" />
          <Line type="monotone" dataKey="p25" stroke="rgba(59,130,246,0.45)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="P25" />
          <Line type="monotone" dataKey="p10" stroke="rgba(59,130,246,0.25)" strokeWidth={1} dot={false} strokeDasharray="3 2" name="P10 Worst" />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const bucketsPanel = (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Retirement Bucket Strategy</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Liquid Bucket', value: results.retirementBuckets.liquid, color: 'var(--accent-blue)', sub: '2 yrs · FD / Savings' },
          { label: 'Conservative', value: results.retirementBuckets.conservative, color: 'var(--accent-gold)', sub: 'Yrs 3–7 · Debt Funds' },
          { label: 'Growth Bucket', value: Math.max(0, results.retirementBuckets.growth), color: 'var(--accent-green)', sub: 'Yr 8+ · Equity' },
        ].map((b) => (
          <div key={b.label} style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{b.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: b.color }}>{formatCompact(b.value)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{b.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const sensitivityTable = (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Return Sensitivity</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Return', 'Projected', 'Required', 'Shortfall'].map((h) => (
              <th key={h} style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textAlign: h === 'Return' ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.sensitivityRows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: row.returnDelta === 0 ? 'var(--bg-elevated)' : undefined }}>
              <td style={{ padding: '7px 10px', fontWeight: row.returnDelta === 0 ? 700 : 400 }}>
                {results.blendedReturnPct.toFixed(1)}{row.returnDelta !== 0 ? (row.returnDelta > 0 ? `+${row.returnDelta}` : `${row.returnDelta}`) : ' (base)'}%
              </td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--accent-green)' }}>{formatCompact(row.projectedCorpus)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--accent-blue)' }}>{formatCompact(row.requiredCorpus)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: row.shortfall > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {row.shortfall > 0 ? `-${formatCompact(row.shortfall)}` : 'Surplus'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const goalsTable = state.goals.length > 0 ? (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Goal Tracker</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Goal', 'FV (inflation-adj)', 'Corpus at Date', 'Status'].map((h, i) => (
              <th key={h} style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textAlign: i === 0 ? 'left' : i === 3 ? 'center' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.goalStatuses.map((gs, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '7px 10px' }}>
                <div style={{ fontWeight: 600 }}>{gs.goal.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{gs.goal.targetDate.slice(0, 4)} · {gs.goal.type.replace(/_/g, ' ')}</div>
              </td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatCompact(gs.futureValue)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatCompact(gs.projectedAvailability)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
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

  // ── Sticky Bottom Bar ──────────────────────────────────────────────────────
  const stickyBar = (
    <div style={{
      position: 'fixed', bottom: 0, left: 'var(--sidebar-width)', right: 0,
      background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
      padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 20,
      zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>LIVE</span>
      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        {[
          { label: 'Projected', value: formatCompact(results.projectedCorpus), color: 'var(--accent-green)' },
          { label: 'Required', value: formatCompact(results.requiredCorpus), color: 'var(--accent-blue)' },
          {
            label: results.isShortfall ? 'Shortfall' : 'Surplus',
            value: `${results.isShortfall ? '-' : '+'}${formatCompact(Math.abs(results.shortfall))}`,
            color: results.isShortfall ? 'var(--accent-red)' : 'var(--accent-green)',
          },
          {
            label: 'P(Success)',
            value: `${mc.probabilityOfSuccess}%`,
            color: mc.probabilityOfSuccess >= 80 ? 'var(--accent-green)' : mc.probabilityOfSuccess >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)',
          },
          { label: 'Blended Return', value: `${results.blendedReturnPct.toFixed(1)}%`, color: 'var(--text-primary)' },
        ].map((item) => (
          <span key={item.label} style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 1 }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleExport}>
          <Download size={12} style={{ marginRight: 4 }} /> Export
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleImport}>
          <Upload size={12} style={{ marginRight: 4 }} /> Import
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', color: 'var(--text-muted)' }} onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const sections = [
    { title: 'Basic Information', subtitle: 'Age, corpus, SIP amount, and timeline', icon: '1', content: section1 },
    { title: 'Living Expenses', subtitle: 'Post-retirement spending streams with inflation', icon: '2', content: section2 },
    { title: 'Passive Income', subtitle: 'Rental, pension, dividends — income in retirement', icon: '3', content: section3 },
    { title: 'Additional Assets', subtitle: 'EPF, NPS, real estate, gold, ESOPs', icon: '4', content: section4 },
    { title: 'Financial Goals', subtitle: 'Milestone withdrawals (education, wedding, home)', icon: '5', content: section5 },
    { title: 'SIP Capacity Events', subtitle: 'Career breaks, windfalls, and salary hikes', icon: '6', content: section6 },
    { title: 'Instrument Parameters', subtitle: 'Asset allocation and return assumptions', icon: '7', content: section7 },
    { title: 'Advanced Options', subtitle: 'Glide path, tax overlay, emergency corpus', icon: '8', content: section8 },
  ];

  return (
    <AppShell>
      <div className="page" style={{ paddingBottom: 70 }}>
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Retirement Planner</h1>
            <p className="page-subtitle">Comprehensive retirement analysis · auto-saved · {mc.iterations.toLocaleString()} Monte Carlo simulations</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={handleExport}>
              <Download size={14} style={{ marginRight: 5 }} /> Export
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={handleImport}>
              <Upload size={14} style={{ marginRight: 5 }} /> Import
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left: Input Sections */}
          <div>
            {sections.map((s, i) => (
              <Section
                key={i}
                title={s.title}
                subtitle={s.subtitle}
                icon={s.icon}
                open={openSections.has(i)}
                onToggle={() => toggleSection(i)}
              >
                {s.content}
              </Section>
            ))}
          </div>

          {/* Right: Results */}
          <div style={{ position: 'sticky', top: 16 }}>
            {summaryCards}
            {shortfallPanel}
            {projChart}
            {mcChart}
            {bucketsPanel}
            {goalsTable}
            {sensitivityTable}
          </div>
        </div>
      </div>

      {stickyBar}
    </AppShell>
  );
}
