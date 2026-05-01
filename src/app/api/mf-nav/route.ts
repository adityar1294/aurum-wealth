import { NextRequest, NextResponse } from 'next/server';

interface NavCache {
  data: Record<string, { nav: number; name: string; date: string }>;
  at: number;
}

const cache: NavCache = { data: {}, at: 0 };
const CACHE_TTL = 4 * 60 * 60 * 1000;

async function fetchAmfiData(): Promise<Record<string, { nav: number; name: string; date: string }>> {
  const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
    next: { revalidate: 14400 },
  });
  const text = await res.text();
  const lines = text.split('\n');
  const result: Record<string, { nav: number; name: string; date: string }> = {};

  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length >= 5) {
      const code = parts[0].trim();
      const name = parts[3].trim();
      const nav = parseFloat(parts[4].trim());
      const date = parts[5]?.trim() || '';
      if (code && !isNaN(nav)) {
        result[code] = { nav, name, date };
      }
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const codes = req.nextUrl.searchParams.get('codes')?.split(',').filter(Boolean) || [];

  if (!codes.length) {
    return NextResponse.json({ error: 'No codes provided' }, { status: 400 });
  }

  if (Date.now() - cache.at >= CACHE_TTL) {
    try {
      const freshData = await fetchAmfiData();
      Object.assign(cache.data, freshData);
      cache.at = Date.now();
    } catch {
      if (!cache.at) {
        return NextResponse.json({ error: 'Failed to fetch NAV data' }, { status: 502 });
      }
    }
  }

  const result: Record<string, { nav: number; name: string; date: string }> = {};
  for (const code of codes) {
    if (cache.data[code]) result[code] = cache.data[code];
  }

  return NextResponse.json(result);
}
