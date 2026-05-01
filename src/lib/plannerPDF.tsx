import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PlannerState, PlannerResults, MonteCarloResult } from './financialPlanning';
import { formatINR, formatCompact } from './currency';

const S = StyleSheet.create({
  page:   { padding: 40, backgroundColor: '#ffffff', fontSize: 10, fontFamily: 'Helvetica', color: '#111118' },
  header: { marginBottom: 20 },
  title:  { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  sub:    { fontSize: 9, color: '#888' },

  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 16, paddingBottom: 4, borderBottom: '1 solid #e5e7eb', color: '#1e1e2a' },

  row2: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  row4: { flexDirection: 'row', gap: 6, marginBottom: 8 },

  card:  { flex: 1, backgroundColor: '#f8f9fa', borderRadius: 6, padding: 10 },
  mLabel: { fontSize: 8, color: '#888', marginBottom: 3 },
  mValue: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  mSub:   { fontSize: 8, color: '#888', marginTop: 2 },

  kv:    { flexDirection: 'row', marginBottom: 5 },
  key:   { width: '42%', color: '#555' },
  val:   { flex: 1, fontFamily: 'Helvetica-Bold' },

  tRow:  { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 3 },
  tHead: { backgroundColor: '#f3f4f6', fontFamily: 'Helvetica-Bold' },
  tAlt:  { backgroundColor: '#f0f7ff' },
  tCell: { flex: 1 },
  tRight: { flex: 1, textAlign: 'right' },

  goalCard: { backgroundColor: '#f8f9fa', borderRadius: 6, padding: 10, marginBottom: 6 },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  goalName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  alert: { backgroundColor: '#eff6ff', borderRadius: 6, padding: 10, marginTop: 8 },
  footer: { marginTop: 20, textAlign: 'center', color: '#aaa', fontSize: 8 },

  green: { color: '#059669' },
  blue:  { color: '#2563eb' },
  red:   { color: '#dc2626' },
  gold:  { color: '#d97706' },
});

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.kv}>
      <Text style={S.key}>{label}</Text>
      <Text style={S.val}>{value}</Text>
    </View>
  );
}

export function PlannerPDF({ state, results, mc, generatedAt, clientName }: {
  state: PlannerState;
  results: PlannerResults;
  mc: MonteCarloResult;
  generatedAt: string;
  clientName?: string;
}) {
  const pSuccessColor = mc.probabilityOfSuccess >= 80 ? S.green : mc.probabilityOfSuccess >= 60 ? S.gold : S.red;
  const shortfallColor = results.isShortfall ? S.red : S.green;

  return (
    <Document title="Retirement Plan" author="Aurum Wealth">
      <Page size="A4" style={S.page}>

        {/* ── Header ────────────────────────────────────── */}
        <View style={S.header}>
          <Text style={S.title}>Retirement Plan{clientName ? ` — ${clientName}` : ''}</Text>
          <Text style={S.sub}>Aurum Wealth · Generated {generatedAt}{clientName ? ` · Prepared for ${clientName}` : ''}</Text>
        </View>

        {/* ── Summary ───────────────────────────────────── */}
        <Text style={S.sectionTitle}>Summary</Text>
        <View style={S.row2}>
          <View style={S.card}>
            <Text style={S.mLabel}>Projected Corpus</Text>
            <Text style={[S.mValue, S.green]}>{formatCompact(results.projectedCorpus)}</Text>
            <Text style={S.mSub}>{formatINR(results.projectedCorpus)}</Text>
          </View>
          <View style={S.card}>
            <Text style={S.mLabel}>Required Corpus</Text>
            <Text style={[S.mValue, S.blue]}>{formatCompact(results.requiredCorpus)}</Text>
            <Text style={S.mSub}>{formatINR(results.requiredCorpus)}</Text>
          </View>
        </View>
        <View style={S.row2}>
          <View style={S.card}>
            <Text style={S.mLabel}>{results.isShortfall ? 'Shortfall' : 'Surplus'}</Text>
            <Text style={[S.mValue, shortfallColor]}>
              {results.isShortfall ? '-' : '+'}{formatCompact(Math.abs(results.shortfall))}
            </Text>
            <Text style={S.mSub}>{results.blendedReturnPct.toFixed(1)}% blended return p.a.</Text>
          </View>
          <View style={S.card}>
            <Text style={S.mLabel}>P(Success) — Monte Carlo</Text>
            <Text style={[S.mValue, pSuccessColor]}>{mc.probabilityOfSuccess}%</Text>
            <Text style={S.mSub}>{mc.iterations.toLocaleString()} simulations</Text>
          </View>
        </View>

        {/* ── Plan Parameters ───────────────────────────── */}
        <Text style={S.sectionTitle}>Plan Parameters</Text>
        <View style={S.row2}>
          <View style={{ flex: 1 }}>
            <KV label="Current Age" value={`${state.currentAge} years`} />
            <KV label="Retirement Age" value={`${state.retirementAge} years`} />
            <KV label="Life Expectancy" value={`${state.lifeExpectancy} years`} />
            <KV label="Years to Retirement" value={`${Math.max(0, state.retirementAge - state.currentAge)} yrs`} />
            <KV label="Years in Retirement" value={`${Math.max(0, state.lifeExpectancy - state.retirementAge)} yrs`} />
          </View>
          <View style={{ flex: 1 }}>
            <KV label="Current Corpus" value={formatINR(state.currentCorpus)} />
            <KV label="Monthly SIP" value={formatINR(state.monthlySIP)} />
            <KV label="SIP Annual Step-up" value={`${state.sipStepUpPct}%`} />
            <KV label="Blended Return" value={`${results.blendedReturnPct.toFixed(1)}% p.a.`} />
            <KV label="Employment Type" value={state.employmentType.replace(/_/g, ' ')} />
          </View>
        </View>

        {/* ── Shortfall Resolution ──────────────────────── */}
        {results.isShortfall && (
          <>
            <Text style={S.sectionTitle}>Shortfall Resolution Options</Text>
            <View style={S.row2}>
              <View style={S.card}>
                <Text style={S.mLabel}>Lumpsum Investment Today</Text>
                <Text style={[S.mValue, S.gold]}>{formatINR(results.lumpsumNeeded)}</Text>
              </View>
              <View style={S.card}>
                <Text style={S.mLabel}>Additional Monthly SIP</Text>
                <Text style={[S.mValue, S.gold]}>{formatINR(results.additionalSIPNeeded)}/mo</Text>
                <Text style={S.mSub}>with {state.sipStepUpPct}% annual step-up</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Retirement Buckets ────────────────────────── */}
        <Text style={S.sectionTitle}>Retirement Bucket Strategy</Text>
        <View style={S.row4}>
          <View style={S.card}>
            <Text style={S.mLabel}>Liquid (Yr 1–2)</Text>
            <Text style={[S.mValue, S.blue]}>{formatCompact(results.retirementBuckets.liquid)}</Text>
            <Text style={S.mSub}>FD / Savings</Text>
          </View>
          <View style={S.card}>
            <Text style={S.mLabel}>Conservative (Yr 3–7)</Text>
            <Text style={[S.mValue, S.gold]}>{formatCompact(results.retirementBuckets.conservative)}</Text>
            <Text style={S.mSub}>Debt Funds</Text>
          </View>
          <View style={S.card}>
            <Text style={S.mLabel}>Growth (Yr 8+)</Text>
            <Text style={[S.mValue, S.green]}>{formatCompact(Math.max(0, results.retirementBuckets.growth))}</Text>
            <Text style={S.mSub}>Equity</Text>
          </View>
        </View>

        {/* ── Sensitivity Table ─────────────────────────── */}
        <Text style={S.sectionTitle}>Return Sensitivity Analysis</Text>
        <View style={[S.tRow, S.tHead]}>
          <Text style={S.tCell}>Return Rate</Text>
          <Text style={S.tRight}>Projected</Text>
          <Text style={S.tRight}>Required</Text>
          <Text style={S.tRight}>Result</Text>
        </View>
        {results.sensitivityRows.map((row, i) => (
          <View key={i} style={[S.tRow, row.returnDelta === 0 ? S.tAlt : {}]}>
            <Text style={[S.tCell, row.returnDelta === 0 ? { fontFamily: 'Helvetica-Bold' } : {}]}>
              {results.blendedReturnPct.toFixed(1)}{row.returnDelta !== 0 ? (row.returnDelta > 0 ? `+${row.returnDelta}` : `${row.returnDelta}`) : ' (base)'}%
            </Text>
            <Text style={[S.tRight, S.green]}>{formatCompact(row.projectedCorpus)}</Text>
            <Text style={[S.tRight, S.blue]}>{formatCompact(row.requiredCorpus)}</Text>
            <Text style={[S.tRight, row.shortfall > 0 ? S.red : S.green]}>
              {row.shortfall > 0 ? `-${formatCompact(row.shortfall)}` : 'Surplus'}
            </Text>
          </View>
        ))}

        {/* ── Goals ─────────────────────────────────────── */}
        {results.goalStatuses.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Financial Goals</Text>
            {results.goalStatuses.map((gs, i) => (
              <View key={i} style={S.goalCard}>
                <View style={S.goalHead}>
                  <Text style={S.goalName}>{gs.goal.name}</Text>
                  <Text style={gs.status === 'on_track' ? S.green : gs.status === 'at_risk' ? S.gold : S.red}>
                    {gs.status === 'on_track' ? 'On Track' : gs.status === 'at_risk' ? 'At Risk' : 'Shortfall'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Text style={{ color: '#888' }}>Target: <Text style={{ color: '#111' }}>{gs.goal.targetDate.slice(0, 4)}</Text></Text>
                  <Text style={{ color: '#888' }}>FV: <Text style={{ color: '#111' }}>{formatCompact(gs.futureValue)}</Text></Text>
                  <Text style={{ color: '#888' }}>Type: <Text style={{ color: '#111' }}>{gs.goal.type.replace(/_/g, ' ')}</Text></Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Emergency Corpus ──────────────────────────── */}
        <View style={S.alert}>
          <Text style={{ color: '#1d4ed8', fontSize: 9 }}>
            Emergency Corpus: Maintain {formatINR(results.emergencyCorpus)} in liquid instruments (FD / liquid funds), separate from retirement corpus.
          </Text>
        </View>

        {/* ── Footer ────────────────────────────────────── */}
        <Text style={S.footer}>
          For informational purposes only. Consult a SEBI-registered financial advisor for personalised advice. · Aurum Wealth
        </Text>

      </Page>
    </Document>
  );
}
