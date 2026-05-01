import { NextRequest, NextResponse } from 'next/server';

interface QuoteResult {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Module-level state persists across requests in the same warm serverless instance
let crumb: string | null = null;
let cookieStr = '';
let crumbFetchedAt = 0;
const CRUMB_TTL = 3_600_000;

const quotesCache: { data: Record<string, QuoteResult>; at: number } = { data: {}, at: 0 };
const QUOTES_TTL = 60_000;

async function refreshCrumb(): Promise<void> {
  try {
    // Yahoo requires a cookie obtained from fc.yahoo.com before accepting API calls
    const cookieRes = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    // getSetCookie() is Node 18+ — fall back to get() on older runtimes
    const setCookies: string[] =
      typeof (cookieRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (cookieRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [(cookieRes.headers.get('set-cookie') ?? '')];
    cookieStr = setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookieStr },
    });
    const text = await crumbRes.text();
    // If Yahoo returns HTML (consent page) instead of the crumb string, bail out
    if (text && !text.trimStart().startsWith('<')) {
      crumb = text.trim();
      crumbFetchedAt = Date.now();
    }
  } catch (err) {
    console.error('[prices] crumb fetch failed:', err);
  }
}

async function fetchViaV7(symbols: string[]): Promise<Record<string, QuoteResult>> {
  const result: Record<string, QuoteResult> = {};
  try {
    const params = new URLSearchParams({
      symbols: symbols.join(','),
      fields: 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName',
      ...(crumb ? { crumb } : {}),
    });
    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(cookieStr ? { Cookie: cookieStr } : {}) },
    });
    if (!res.ok) {
      // Crumb likely stale — force refresh next time
      crumb = null;
      return result;
    }
    const json = await res.json();
    for (const q of (json?.quoteResponse?.result ?? [])) {
      if (q.regularMarketPrice) {
        result[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          name: q.shortName ?? q.symbol,
        };
      }
    }
  } catch (err) {
    console.error('[prices] v7 fetch failed:', err);
  }
  return result;
}

async function fetchViaV8Chart(symbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.chartPreviousClose ?? meta.regularMarketPrice;
    const change = meta.regularMarketPrice - prev;
    return {
      price: meta.regularMarketPrice,
      change,
      changePercent: prev ? (change / prev) * 100 : 0,
      name: meta.shortName ?? meta.longName ?? symbol,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols')?.split(',').filter(Boolean) ?? [];
  if (!symbols.length) return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });

  // Serve from cache when warm
  if (Date.now() - quotesCache.at < QUOTES_TTL) {
    const hit: Record<string, QuoteResult> = {};
    for (const s of symbols) if (quotesCache.data[s]) hit[s] = quotesCache.data[s];
    if (Object.keys(hit).length === symbols.length) return NextResponse.json(hit);
  }

  // Ensure crumb is fresh
  if (!crumb || Date.now() - crumbFetchedAt > CRUMB_TTL) {
    await refreshCrumb();
  }

  // Primary: batch v7 with crumb
  const result = await fetchViaV7(symbols);

  // Fallback: v8/chart for any symbol that v7 missed
  const missing = symbols.filter((s) => !result[s]);
  if (missing.length) {
    await Promise.allSettled(
      missing.map(async (sym) => {
        const q = await fetchViaV8Chart(sym);
        if (q) result[sym] = q;
      })
    );
  }

  // Ensure every requested symbol has an entry (even if zeroed out)
  for (const s of symbols) {
    if (!result[s]) result[s] = { price: 0, change: 0, changePercent: 0, name: s };
  }

  Object.assign(quotesCache.data, result);
  quotesCache.at = Date.now();

  return NextResponse.json(result);
}
