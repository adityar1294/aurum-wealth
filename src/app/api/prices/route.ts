import { NextRequest, NextResponse } from 'next/server';

interface QuoteResult {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' };

const cache: { data: Record<string, QuoteResult>; at: number } = { data: {}, at: 0 };
const CACHE_TTL = 60_000;

async function fetchSymbol(symbol: string): Promise<QuoteResult | null> {
  try {
    // v8/chart on query2 works without auth/crumb from cloud IPs
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`,
      { headers: HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
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
  const symbols = req.nextUrl.searchParams.get('symbols')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  if (!symbols.length) return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });

  if (Date.now() - cache.at < CACHE_TTL) {
    const hit: Record<string, QuoteResult> = {};
    for (const s of symbols) if (cache.data[s]) hit[s] = cache.data[s];
    if (Object.keys(hit).length === symbols.length) return NextResponse.json(hit);
  }

  const results = await Promise.allSettled(symbols.map(fetchSymbol));
  const out: Record<string, QuoteResult> = {};
  results.forEach((r, i) => {
    out[symbols[i]] = r.status === 'fulfilled' && r.value
      ? r.value
      : { price: 0, change: 0, changePercent: 0, name: symbols[i] };
  });

  Object.assign(cache.data, out);
  cache.at = Date.now();
  return NextResponse.json(out);
}
