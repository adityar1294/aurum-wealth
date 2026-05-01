// ─────────────────────────────────────────────────────────────────────────────
// Financial Planning Computation Engine
// All computation is client-side. No API calls required.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskProfile = 'very_conservative' | 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
export type GoalType = 'non_negotiable' | 'flexible' | 'aspirational';
export type SIPEffectType = 'increase' | 'decrease' | 'pause' | 'windfall';
export type AssetKind =
  | 'equity_mf' | 'epf_ppf' | 'nps' | 'real_estate'
  | 'gold_physical' | 'gold_sgb' | 'fd' | 'unlisted_esop' | 'other';

export interface ExpenseStream {
  id: string;
  name: string;
  monthlyAmount: number;
  inflationRate: number;
  stepUpAfterRetirement: boolean;
  adjustments: Array<{ date: string; amount: number }>;
}

export interface IncomeStream {
  id: string;
  name: string;
  monthlyAmount: number;
  preRetirementGrowth: number;
  postRetirementGrowth: number;
  hasEndDate: boolean;
  endDate: string;
}

export interface AdditionalAsset {
  id: string;
  kind: AssetKind;
  label: string;
  currentValue: number;
  expectedReturn: number;
  includedInCorpus: boolean;
  goalId: string;
  maturityDate: string;
  annuityPct: number;
  rentalYield: number;
  liquidityDate: string;
  haircut: number;
}

export interface FinancialGoal {
  id: string;
  name: string;
  type: GoalType;
  targetDate: string;
  presentValue: number;
  inflationRate: number;
  priority: number;
  assetId: string;
}

export interface SIPEffect {
  id: string;
  type: SIPEffectType;
  startDate: string;
  endDate: string;
  amount: number;
  inflationOnAmount: number;
}

export interface InstrumentParams {
  riskProfile: RiskProfile;
  coreEquity: number;
  hybrid: number;
  debt: number;
  gold: number;
  realEstate: number;
  inflation: number;
}

export interface GlidePathBucket {
  id: string;
  fromAge: number;
  toAge: number;
  equityPct: number;
  debtPct: number;
  goldPct: number;
}

export interface LoanEntry {
  id: string;
  name: string;
  outstandingBalance: number;
  interestRate: number;
  remainingTenureMonths: number;
  emiOverride: number;
}

export interface PlannerState {
  // Basic Info
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentCorpus: number;
  monthlySIP: number;
  sipStepUpPct: number;
  targetCorpusOverride: number;
  employmentType: 'salaried' | 'self_employed' | 'business';

  // Sections
  expenses: ExpenseStream[];
  incomeStreams: IncomeStream[];
  assets: AdditionalAsset[];
  goals: FinancialGoal[];
  sipEffects: SIPEffect[];
  loans: LoanEntry[];
  params: InstrumentParams;

  // Advanced
  glidePathEnabled: boolean;
  glidePath: GlidePathBucket[];
  taxEnabled: boolean;
  incomeTaxSlab: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const RISK_DEFAULTS: Record<RiskProfile, InstrumentParams> = {
  very_conservative: { riskProfile: 'very_conservative', coreEquity: 20, hybrid: 20, debt: 50, gold: 10, realEstate: 0, inflation: 6 },
  conservative:     { riskProfile: 'conservative',     coreEquity: 35, hybrid: 25, debt: 30, gold: 10, realEstate: 0, inflation: 6 },
  moderate:         { riskProfile: 'moderate',         coreEquity: 50, hybrid: 20, debt: 20, gold: 10, realEstate: 0, inflation: 6 },
  aggressive:       { riskProfile: 'aggressive',       coreEquity: 70, hybrid: 10, debt: 10, gold: 10, realEstate: 0, inflation: 6 },
  very_aggressive:  { riskProfile: 'very_aggressive',  coreEquity: 85, hybrid: 5,  debt: 5,  gold: 5,  realEstate: 0, inflation: 6 },
};

// Historical CAGR reference returns (%)
export const INSTRUMENT_RETURNS = {
  coreEquity: 13.2,  // Nifty 50 historical
  hybrid: 11.0,
  debt: 7.0,
  gold: 8.5,
  realEstate: 9.0,
};

export const DEFAULT_STATE: PlannerState = {
  currentAge: 35,
  retirementAge: 60,
  lifeExpectancy: 85,
  currentCorpus: 5000000,
  monthlySIP: 50000,
  sipStepUpPct: 10,
  targetCorpusOverride: 0,
  employmentType: 'salaried',
  expenses: [
    { id: 'e1', name: 'Living Expenses', monthlyAmount: 80000, inflationRate: 6, stepUpAfterRetirement: false, adjustments: [] },
  ],
  incomeStreams: [],
  assets: [],
  goals: [],
  sipEffects: [],
  loans: [],
  params: RISK_DEFAULTS.moderate,
  glidePathEnabled: false,
  glidePath: [],
  taxEnabled: false,
  incomeTaxSlab: 30,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Box-Muller normal distribution sample */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Weighted blended annual return from instrument params (%) */
export function blendedReturn(params: InstrumentParams): number {
  const total = params.coreEquity + params.hybrid + params.debt + params.gold + params.realEstate;
  if (total === 0) return params.coreEquity;
  return (
    (params.coreEquity * INSTRUMENT_RETURNS.coreEquity +
      params.hybrid * INSTRUMENT_RETURNS.hybrid +
      params.debt * INSTRUMENT_RETURNS.debt +
      params.gold * INSTRUMENT_RETURNS.gold +
      params.realEstate * INSTRUMENT_RETURNS.realEstate) /
    total
  );
}

/** Monthly return from annual return % */
function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/** Effective annual SIP amount adjusted for effects at a given year offset */
function effectiveMonthlySIP(baseSIP: number, stepUpPct: number, yearIdx: number, effects: SIPEffect[], baseYear: number): number {
  let sip = baseSIP * Math.pow(1 + stepUpPct / 100, yearIdx);

  const year = baseYear + yearIdx;
  const yStr = String(year);

  for (const e of effects) {
    const start = new Date(e.startDate).getFullYear();
    const end = e.endDate ? new Date(e.endDate).getFullYear() : start;
    if (year < start || year > end) continue;
    const yearsIn = year - start;
    const inflated = e.amount * Math.pow(1 + e.inflationOnAmount / 100, yearsIn);
    if (e.type === 'pause') return 0;
    if (e.type === 'increase') sip += inflated;
    if (e.type === 'decrease') sip = Math.max(0, sip - inflated);
    if (e.type === 'windfall' && start === year) sip += inflated; // one-time
  }
  return sip;
  void yStr;
}

/** FV of SIP contributions for a single year at a given monthly SIP */
function yearSIPFV(monthlySIP: number, annualReturnPct: number): number {
  const r = monthlyRate(annualReturnPct);
  return monthlySIP * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r);
}

// ── Core Computation ──────────────────────────────────────────────────────────

export interface ProjectionPoint {
  age: number;
  year: number;
  corpus: number;
  sipAdded: number;
  goalWithdrawals: number;
}

export interface MonteCarloResult {
  bands: Array<{ age: number; p10: number; p25: number; p50: number; p75: number; p90: number }>;
  probabilityOfSuccess: number;
  iterations: number;
}

export interface GoalStatus {
  goal: FinancialGoal;
  futureValue: number;
  projectedAvailability: number;
  status: 'on_track' | 'at_risk' | 'shortfall';
}

export interface PlannerResults {
  blendedReturnPct: number;
  projectedCorpus: number;
  requiredCorpus: number;
  shortfall: number;
  isShortfall: boolean;
  lumpsumNeeded: number;
  additionalSIPNeeded: number;
  yearlyProjection: ProjectionPoint[];
  goalStatuses: GoalStatus[];
  sensitivityRows: Array<{ returnDelta: number; projectedCorpus: number; requiredCorpus: number; shortfall: number }>;
  emergencyCorpus: number;
  retirementBuckets: { liquid: number; conservative: number; growth: number };
}

/** Main synchronous plan computation */
export function computePlan(state: PlannerState): PlannerResults {
  const { currentAge, retirementAge, lifeExpectancy, sipEffects } = state;
  const yearsToRetirement = Math.max(1, retirementAge - currentAge);
  const yearsInRetirement = Math.max(1, lifeExpectancy - retirementAge);
  const baseYear = new Date().getFullYear();
  const retirementYear = baseYear + yearsToRetirement;

  const returnPct = blendedReturn(state.params);
  const annualReturn = returnPct / 100;

  // ── Phase 1: accumulation ──────────────────────────────────────────────────
  let corpus = state.currentCorpus;
  const projection: ProjectionPoint[] = [];

  // Add non-corpus assets compounded to retirement
  for (const asset of state.assets) {
    if (asset.includedInCorpus || asset.currentValue <= 0) continue;
    const assetReturn = asset.expectedReturn / 100;
    const yr = asset.maturityDate ? Math.min(yearsToRetirement, new Date(asset.maturityDate).getFullYear() - baseYear) : yearsToRetirement;
    const fv = asset.currentValue * Math.pow(1 + assetReturn, Math.max(0, yr));
    // Apply NPS annuity haircut
    const effectiveFV = asset.kind === 'nps' ? fv * (1 - (asset.annuityPct || 40) / 100) : fv;
    // Apply unlisted haircut
    const finalFV = asset.kind === 'unlisted_esop' ? effectiveFV * (1 - (asset.haircut || 30) / 100) : effectiveFV;
    corpus += finalFV;
  }

  for (let y = 0; y < yearsToRetirement; y++) {
    const age = currentAge + y;
    const year = baseYear + y;

    const sip = effectiveMonthlySIP(state.monthlySIP, state.sipStepUpPct, y, sipEffects, baseYear);
    const sipContrib = yearSIPFV(sip, returnPct);

    corpus = corpus * (1 + annualReturn) + sipContrib;

    // Goal withdrawals
    let goalWithdrawals = 0;
    for (const goal of state.goals) {
      const goalYear = new Date(goal.targetDate).getFullYear();
      if (goalYear === year) {
        // If earmarked to an asset, skip (asset handles it)
        if (goal.assetId) continue;
        const fv = goal.presentValue * Math.pow(1 + goal.inflationRate / 100, y + 1);
        goalWithdrawals += fv;
      }
    }
    corpus = Math.max(0, corpus - goalWithdrawals);

    projection.push({ age, year, corpus, sipAdded: sipContrib, goalWithdrawals });
  }

  const projectedCorpus = corpus;

  // ── Phase 2: distribution (required corpus) ───────────────────────────────
  let requiredCorpus = 0;
  const retirementExpenseBase = state.expenses.reduce((sum, e) => sum + e.monthlyAmount * 12, 0);

  for (let y = 0; y < yearsInRetirement; y++) {
    // Total inflated expenses
    let yearExpenses = 0;
    for (const e of state.expenses) {
      const base = e.monthlyAmount * 12;
      const inflated = base * Math.pow(1 + e.inflationRate / 100, yearsToRetirement + y);
      yearExpenses += inflated;
    }

    // Total passive income
    let yearIncome = 0;
    for (const inc of state.incomeStreams) {
      if (inc.hasEndDate && inc.endDate) {
        const endYear = new Date(inc.endDate).getFullYear();
        if (retirementYear + y > endYear) continue;
      }
      const preGrowth = inc.monthlyAmount * Math.pow(1 + inc.preRetirementGrowth / 100, yearsToRetirement);
      const postGrowth = preGrowth * Math.pow(1 + inc.postRetirementGrowth / 100, y);
      yearIncome += postGrowth * 12;
    }

    const netExpense = Math.max(0, yearExpenses - yearIncome);
    requiredCorpus += netExpense / Math.pow(1 + annualReturn, y);
  }

  const targetCorpus = state.targetCorpusOverride > 0 ? state.targetCorpusOverride : requiredCorpus;
  const shortfall = Math.max(0, targetCorpus - projectedCorpus);
  const isShortfall = shortfall > 0;

  const lumpsumNeeded = isShortfall
    ? shortfall / Math.pow(1 + annualReturn, yearsToRetirement)
    : 0;

  const additionalSIPNeeded = isShortfall
    ? findAdditionalSIP(shortfall, yearsToRetirement, returnPct, state.sipStepUpPct)
    : 0;

  // ── Goal statuses ──────────────────────────────────────────────────────────
  const goalStatuses: GoalStatus[] = state.goals.map((goal) => {
    const yearsToGoal = Math.max(0, new Date(goal.targetDate).getFullYear() - baseYear);
    const fv = goal.presentValue * Math.pow(1 + goal.inflationRate / 100, yearsToGoal);
    const point = projection.find((p) => p.year === baseYear + yearsToGoal);
    const avail = point ? point.corpus : projectedCorpus;
    const ratio = fv > 0 ? avail / fv : 1;
    return {
      goal,
      futureValue: fv,
      projectedAvailability: avail,
      status: ratio >= 1 ? 'on_track' : ratio >= 0.9 ? 'at_risk' : 'shortfall',
    };
  });

  // ── Sensitivity table ──────────────────────────────────────────────────────
  const sensitivityRows = [-2, -1, 0, 1, 2].map((delta) => {
    const adjReturn = returnPct + delta;
    const adjCorpus = projectCorpusSimple(state, adjReturn, yearsToRetirement, baseYear);
    const adjRequired = requiredCorpusSimple(state, adjReturn, yearsToRetirement, yearsInRetirement);
    const sf = Math.max(0, adjRequired - adjCorpus);
    return { returnDelta: delta, projectedCorpus: adjCorpus, requiredCorpus: adjRequired, shortfall: sf };
  });

  // ── Emergency corpus ──────────────────────────────────────────────────────
  const monthsEmergency = state.employmentType === 'business' ? 12 : state.employmentType === 'self_employed' ? 6 : 3;
  const emergencyCorpus = (retirementExpenseBase / 12) * monthsEmergency;

  // ── Retirement buckets ────────────────────────────────────────────────────
  const monthlyExpenseAtRetirement = state.expenses.reduce((s, e) =>
    s + e.monthlyAmount * Math.pow(1 + e.inflationRate / 100, yearsToRetirement), 0);
  const liquid = monthlyExpenseAtRetirement * 24;          // 2 years
  const conservative = monthlyExpenseAtRetirement * 60;    // 5 years (3-7)
  const growth = Math.max(0, projectedCorpus - liquid - conservative);
  const retirementBuckets = { liquid, conservative, growth };

  return {
    blendedReturnPct: returnPct,
    projectedCorpus,
    requiredCorpus: targetCorpus,
    shortfall,
    isShortfall,
    lumpsumNeeded,
    additionalSIPNeeded,
    yearlyProjection: projection,
    goalStatuses,
    sensitivityRows,
    emergencyCorpus,
    retirementBuckets,
  };
}

// ── Helper: simple corpus projection (for sensitivity) ────────────────────────
function projectCorpusSimple(state: PlannerState, returnPct: number, years: number, baseYear: number): number {
  const r = returnPct / 100;
  let corpus = state.currentCorpus;
  for (let y = 0; y < years; y++) {
    const sip = state.monthlySIP * Math.pow(1 + state.sipStepUpPct / 100, y);
    corpus = corpus * (1 + r) + yearSIPFV(sip, returnPct);
  }
  return corpus;
}

function requiredCorpusSimple(state: PlannerState, returnPct: number, yearsToRetirement: number, yearsInRetirement: number): number {
  const r = returnPct / 100;
  let req = 0;
  for (let y = 0; y < yearsInRetirement; y++) {
    let exp = 0;
    for (const e of state.expenses) {
      exp += e.monthlyAmount * 12 * Math.pow(1 + e.inflationRate / 100, yearsToRetirement + y);
    }
    req += exp / Math.pow(1 + r, y);
  }
  return req;
}

// ── Helper: binary search for additional SIP ──────────────────────────────────
function findAdditionalSIP(shortfall: number, years: number, returnPct: number, stepUpPct: number): number {
  let lo = 0, hi = shortfall;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const fv = stepUpSIPFV(mid, stepUpPct / 100, returnPct / 100, years);
    if (fv < shortfall) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function stepUpSIPFV(monthly: number, annualStepUp: number, annualReturn: number, years: number): number {
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let corpus = 0;
  let sip = monthly;
  for (let y = 0; y < years; y++) {
    corpus = corpus * Math.pow(1 + r, 12);
    corpus += sip * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r);
    sip *= 1 + annualStepUp;
  }
  return corpus;
}

// ── Monte Carlo Simulation ────────────────────────────────────────────────────

const STD_DEVS: Record<string, number> = {
  coreEquity: 0.18,
  hybrid: 0.12,
  debt: 0.03,
  gold: 0.14,
  realEstate: 0.08,
};

function blendedStdDev(params: InstrumentParams): number {
  const total = params.coreEquity + params.hybrid + params.debt + params.gold + params.realEstate || 100;
  return Math.sqrt(
    Math.pow((params.coreEquity / total) * STD_DEVS.coreEquity, 2) +
    Math.pow((params.hybrid / total) * STD_DEVS.hybrid, 2) +
    Math.pow((params.debt / total) * STD_DEVS.debt, 2) +
    Math.pow((params.gold / total) * STD_DEVS.gold, 2) +
    Math.pow((params.realEstate / total) * STD_DEVS.realEstate, 2)
  );
}

export function runMonteCarlo(state: PlannerState, requiredCorpus: number, iterations = 2000): MonteCarloResult {
  const { currentAge, retirementAge } = state;
  const years = retirementAge - currentAge;
  const meanReturn = blendedReturn(state.params) / 100;
  const stdDev = blendedStdDev(state.params);
  const baseYear = new Date().getFullYear();

  // Each iteration produces corpus at each year
  const corpusByYear: number[][] = Array.from({ length: years + 1 }, () => []);

  let successCount = 0;

  for (let i = 0; i < iterations; i++) {
    let corpus = state.currentCorpus;
    for (let y = 0; y < years; y++) {
      const annualReturn = meanReturn + stdDev * randn();
      const sip = effectiveMonthlySIP(state.monthlySIP, state.sipStepUpPct, y, state.sipEffects, baseYear);
      corpus = corpus * (1 + annualReturn) + yearSIPFV(sip, (meanReturn + stdDev * randn()) * 100);
      corpus = Math.max(0, corpus);
      corpusByYear[y + 1].push(corpus);
    }
    if (corpus >= requiredCorpus) successCount++;
  }

  const percentile = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
  };

  const bands = corpusByYear.map((yearData, idx) => ({
    age: currentAge + idx,
    p10: percentile(yearData, 10),
    p25: percentile(yearData, 25),
    p50: percentile(yearData, 50),
    p75: percentile(yearData, 75),
    p90: percentile(yearData, 90),
  }));

  return {
    bands,
    probabilityOfSuccess: Math.round((successCount / iterations) * 100),
    iterations,
  };
}
