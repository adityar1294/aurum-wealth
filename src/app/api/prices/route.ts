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

  if (!symbols.length) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
  }

  if (Date.now() - cache.at < CACHE_TTL) {
    const result: Record<string, QuoteResult> = {};
    for (const s of symbols) {
      if (cache.data[s]) result[s] = cache.data[s];
    }
    if (Object.keys(result).length === symbols.length) {
      return NextResponse.json(result);
    }
  }

  const result: Record<string, QuoteResult> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let yf: any;
  try {
    const mod = await import('yahoo-finance2');
    yf = mod.default;
  } catch {
    return NextResponse.json({ error: 'yahoo-finance2 unavailable' }, { status: 503 });
  }

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const quote = await yf.quote(symbol, {}, { validateResult: false });
        result[symbol] = {
          price: quote.regularMarketPrice ?? 0,
          change: quote.regularMarketChange ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
          name: quote.shortName ?? quote.longName ?? symbol,
        };
      } catch {
        result[symbol] = { price: 0, change: 0, changePercent: 0, name: symbol };
      }
    })
  );

  Object.assign(cache.data, result);
  cache.at = Date.now();

  return NextResponse.json(result);
}
