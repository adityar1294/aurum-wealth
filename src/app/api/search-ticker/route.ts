import { NextRequest, NextResponse } from 'next/server';

export interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string; // EQUITY, MUTUALFUND, ETF, INDEX, etc.
  currency: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false&enableNavLinks=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json([]);
    const json = await res.json();
    const results: TickerResult[] = (json?.quotes ?? [])
      .filter((q: Record<string, unknown>) => q.symbol && q.quoteType !== 'OPTION')
      .map((q: Record<string, string>) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || '',
        type: q.quoteType || 'EQUITY',
        currency: q.currency || 'INR',
      }));
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
