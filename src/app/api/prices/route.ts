import { NextRequest, NextResponse } from 'next/server';

interface QuoteResult {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

interface CacheEntry {
  data: Record<string, QuoteResult>;
  at: number;
}

const cache: CacheEntry = { data: {}, at: 0 };
const CACHE_TTL = 60_000;

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols')?.split(',').filter(Boolean) || [];
  if (!symbols.length) return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });

  if (Date.now() - cache.at < CACHE_TTL) {
    const hit: Record<string, QuoteResult> = {};
    for (const s of symbols) if (cache.data[s]) hit[s] = cache.data[s];
    if (Object.keys(hit).length === symbols.length) return NextResponse.json(hit);
  }

  const result: Record<string, QuoteResult> = {};

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (res.ok) {
      const json = await res.json();
      const quotes = json?.quoteResponse?.result ?? [];
      for (const q of quotes) {
        result[q.symbol] = {
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          name: q.shortName ?? q.symbol,
        };
      }
    }
  } catch (err) {
    console.error('[prices] Yahoo Finance fetch failed:', err);
  }

  // Fill any missing symbols with zeros so callers know we tried
  for (const s of symbols) {
    if (!result[s]) result[s] = { price: 0, change: 0, changePercent: 0, name: s };
  }

  Object.assign(cache.data, result);
  cache.at = Date.now();

  return NextResponse.json(result);
}
