interface Cashflow {
  amount: number;
  date: Date;
}

function xnpv(rate: number, cashflows: Cashflow[]): number {
  const first = cashflows[0].date;
  return cashflows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - first.getTime()) / (365.25 * 24 * 3600 * 1000);
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

function xnpvDerivative(rate: number, cashflows: Cashflow[]): number {
  const first = cashflows[0].date;
  return cashflows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - first.getTime()) / (365.25 * 24 * 3600 * 1000);
    return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

export function calculateXIRR(cashflows: Cashflow[]): number | null {
  if (!cashflows || cashflows.length < 2) return null;

  const hasPositive = cashflows.some((cf) => cf.amount > 0);
  const hasNegative = cashflows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;

  for (let i = 0; i < 1000; i++) {
    const npv = xnpv(rate, cashflows);
    const deriv = xnpvDerivative(rate, cashflows);

    if (Math.abs(deriv) < 1e-12) break;

    const newRate = rate - npv / deriv;

    if (Math.abs(newRate - rate) < 1e-7) return newRate * 100;

    rate = newRate;

    if (rate <= -1) rate = -0.999;
  }

  return null;
}

export type { Cashflow };
