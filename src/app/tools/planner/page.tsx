'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatINR, formatCompact } from '@/lib/currency';
import { Calculator } from 'lucide-react';

interface GoalResult {
  year: number;
  withoutInflation: number;
  withInflation: number;
  corpus: number;
}

export default function PlannerPage() {
  const [monthlyInvestment, setMonthlyInvestment] = useState('10000');
  const [annualReturn, setAnnualReturn] = useState('12');
  const [years, setYears] = useState('20');
  const [inflationRate, setInflationRate] = useState('6');
  const [goalAmount, setGoalAmount] = useState('10000000');
  const [results, setResults] = useState<GoalResult[]>([]);
  const [sipNeeded, setSipNeeded] = useState<number | null>(null);
  const [finalCorpus, setFinalCorpus] = useState<number | null>(null);

  const calculate = () => {
    const monthly = parseFloat(monthlyInvestment);
    const r = parseFloat(annualReturn) / 100 / 12;
    const n = parseFloat(years) * 12;
    const inflation = parseFloat(inflationRate) / 100;
    const goal = parseFloat(goalAmount);

    const data: GoalResult[] = [];
    let corpus = 0;

    for (let y = 1; y <= parseFloat(years); y++) {
      const months = y * 12;
      corpus = monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
      const inflationAdjusted = goal * Math.pow(1 + inflation, y);
      data.push({
        year: y,
        withoutInflation: goal,
        withInflation: Math.round(inflationAdjusted),
        corpus: Math.round(corpus),
      });
    }

    setResults(data);
    setFinalCorpus(Math.round(corpus));

    const inflationGoal = goal * Math.pow(1 + inflation, parseFloat(years));
    const neededSip = (inflationGoal * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
    setSipNeeded(Math.round(neededSip));
  };

  const lumpsum = () => {
    const r = parseFloat(annualReturn) / 100 / 12;
    const n = parseFloat(years) * 12;
    const monthly = parseFloat(monthlyInvestment);
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  };

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Financial Planner</h1>
            <p className="page-subtitle">SIP calculator, goal planner & inflation projections</p>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: 20 }}>
              <Calculator size={16} style={{ display: 'inline', marginRight: 8 }} />
              SIP & Goal Calculator
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label className="label">Monthly Investment (₹)</label>
                <input className="input" type="number" value={monthlyInvestment} onChange={(e) => setMonthlyInvestment(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Expected Annual Return (%)</label>
                <input className="input" type="number" value={annualReturn} onChange={(e) => setAnnualReturn(e.target.value)} step="0.5" />
              </div>
              <div className="field">
                <label className="label">Investment Period (Years)</label>
                <input className="input" type="number" value={years} onChange={(e) => setYears(e.target.value)} min="1" max="50" />
              </div>
              <div className="field">
                <label className="label">Inflation Rate (%)</label>
                <input className="input" type="number" value={inflationRate} onChange={(e) => setInflationRate(e.target.value)} step="0.5" />
              </div>
              <div className="field">
                <label className="label">Goal Amount (₹)</label>
                <input className="input" type="number" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={calculate}>Calculate</button>
            </div>
          </div>

          <div>
            {finalCorpus !== null && (
              <>
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div className="metric-card">
                    <div className="metric-label">Final Corpus</div>
                    <div className="metric-value" style={{ fontSize: 20, color: 'var(--accent-green)' }}>{formatCompact(finalCorpus)}</div>
                    <div className="metric-sub">{formatINR(finalCorpus)}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Total Invested</div>
                    <div className="metric-value" style={{ fontSize: 20 }}>{formatCompact(parseFloat(monthlyInvestment) * parseFloat(years) * 12)}</div>
                    <div className="metric-sub">{formatINR(parseFloat(monthlyInvestment) * parseFloat(years) * 12)}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">Wealth Gained</div>
                    <div className="metric-value" style={{ fontSize: 20, color: 'var(--accent-blue)' }}>
                      {formatCompact(finalCorpus - parseFloat(monthlyInvestment) * parseFloat(years) * 12)}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">SIP Needed for Goal</div>
                    <div className="metric-value" style={{ fontSize: 20, color: sipNeeded && sipNeeded > parseFloat(monthlyInvestment) ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {sipNeeded ? formatINR(sipNeeded) : '—'}
                    </div>
                    <div className="metric-sub">inflation-adjusted</div>
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Corpus vs Goal Projection</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={results}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="year" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1e5).toFixed(0)}L`} />
                      <Tooltip formatter={(v: number) => formatINR(v)} labelFormatter={(l) => `Year ${l}`} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <Legend />
                      <Line type="monotone" dataKey="corpus" stroke="var(--accent-green)" strokeWidth={2} name="SIP Corpus" dot={false} />
                      <Line type="monotone" dataKey="withInflation" stroke="var(--accent-red)" strokeWidth={2} name="Goal (inflation-adj)" dot={false} strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="withoutInflation" stroke="var(--text-muted)" strokeWidth={1} name="Goal (today)" dot={false} strokeDasharray="2 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            {finalCorpus === null && (
              <div className="empty-state" style={{ height: '100%', minHeight: 300 }}>
                <Calculator size={40} />
                <h3>Enter values and calculate</h3>
                <p>See your SIP growth, required SIP for your goal, and inflation projections</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid-3 mt-24">
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Rule of 72</h3>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>Doubling time at your assumed return rate:</p>
            <div className="metric-value" style={{ fontSize: 28, color: 'var(--accent-blue)' }}>
              {annualReturn ? (72 / parseFloat(annualReturn)).toFixed(1) : '—'} years
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Inflation Impact</h3>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
              ₹1 Lakh today will be worth in {years} years:
            </p>
            <div className="metric-value" style={{ fontSize: 22, color: 'var(--accent-gold)' }}>
              {formatINR(100000 * Math.pow(1 + parseFloat(inflationRate || '6') / 100, parseFloat(years || '20')))}
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Lumpsum Growth</h3>
            <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
              Monthly SIP of {formatINR(parseFloat(monthlyInvestment || '0'))} grows to:
            </p>
            <div className="metric-value" style={{ fontSize: 22, color: 'var(--accent-green)' }}>
              {formatCompact(lumpsum())}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
