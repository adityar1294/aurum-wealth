'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

const INDICES = [
  { symbol: '^NSEI',  label: 'Nifty 50', colorClass: 'metric-aum' },
  { symbol: '^BSESN', label: 'Sensex',   colorClass: 'metric-clients' },
];

const STOCKS = [
  { symbol: 'RELIANCE.NS',   label: 'Reliance' },
  { symbol: 'HDFCBANK.NS',   label: 'HDFC Bank' },
  { symbol: 'INFY.NS',       label: 'Infosys' },
  { symbol: 'TCS.NS',        label: 'TCS' },
  { symbol: 'ICICIBANK.NS',  label: 'ICICI Bank' },
  { symbol: 'KOTAKBANK.NS',  label: 'Kotak Bank' },
  { symbol: 'AXISBANK.NS',   label: 'Axis Bank' },
  { symbol: 'SBIN.NS',       label: 'SBI' },
  { symbol: 'BAJFINANCE.NS', label: 'Bajaj Finance' },
  { symbol: 'WIPRO.NS',      label: 'Wipro' },
];

const ALL_SYMBOLS = [...INDICES.map((i) => i.symbol), ...STOCKS.map((s) => s.symbol)];
const REFRESH_INTERVAL = 30;

export default function MarketPage() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchAll = async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch(`/api/prices?symbols=${encodeURIComponent(ALL_SYMBOLS.join(','))}`);
      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) => ({ ...prev, ...data }));
        setLastUpdated(new Date());
        setSecondsAgo(0);
        setCountdown(REFRESH_INTERVAL);
      }
    } catch {}
    if (!quiet) setRefreshing(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, []);

  // Live countdown & seconds-ago ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo((s) => s + 1);
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const searchStock = async () => {
    if (!searchSymbol.trim()) return;
    setSearchLoading(true);
    const sym = searchSymbol.trim().toUpperCase();
    try {
      const res = await fetch(`/api/prices?symbols=${encodeURIComponent([sym, `${sym}.NS`, `${sym}.BO`].join(','))}`);
      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) => ({ ...prev, ...data }));
      }
    } catch {}
    setSearchLoading(false);
  };

  const customQuotes = Object.entries(quotes).filter(([sym]) => !ALL_SYMBOLS.includes(sym));

  return (
    <AppShell>
      <div className="page dashboard-page">

        {/* ── Hero ── */}
        <div className="dashboard-hero">
          <div>
            <div className="hero-date">
              {lastUpdated
                ? `Updated ${secondsAgo}s ago · refreshes in ${countdown}s`
                : 'Loading market data…'}
            </div>
            <h1>Market.</h1>
            <p>live Indian equities.</p>
          </div>
          <div className="hero-actions">
            <div className="search-bar" style={{ width: 280 }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                placeholder="Search: RELIANCE, AAPL, ^NSEI…"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchStock()}
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => fetchAll()}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Index hero cards (Nifty + Sensex) ── */}
        <div className="dashboard-metrics" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
          {INDICES.map(({ symbol, label, colorClass }) => {
            const q = quotes[symbol];
            const up = q ? q.change >= 0 : true;
            return (
              <div key={symbol} className={`metric-feature ${colorClass}`}>
                <span>{label}</span>
                <strong>
                  {q
                    ? q.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    : <span className="skeleton" style={{ display: 'inline-block', width: 120, height: 44, borderRadius: 8 }} />}
                </strong>
                {q && (
                  <em style={{
                    fontStyle: 'normal',
                    color: up ? 'var(--accent-green)' : 'var(--accent-red)',
                    fontWeight: 700,
                  }}>
                    {up ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                  </em>
                )}
                {q && (
                  <div className="metric-foot">
                    <b className={up ? '' : 'negative'}>
                      {up ? '+' : ''}{q.change.toFixed(2)}
                    </b>
                    <small>{up ? 'Advancing today' : 'Declining today'}</small>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Custom search results ── */}
        {customQuotes.length > 0 && (
          <div className="dashboard-panel" style={{ marginBottom: 20 }}>
            <div className="dashboard-card-head">
              <h2>Search results</h2>
              <span>{customQuotes.length} found</span>
            </div>
            <div className="grid-4">
              {customQuotes.map(([sym, q]) => {
                const up = q.change >= 0;
                return (
                  <div key={sym} className="metric-card">
                    <div className="flex-between">
                      <div className="metric-label">{sym}</div>
                      {up
                        ? <TrendingUp size={16} color="var(--accent-green)" />
                        : <TrendingDown size={16} color="var(--accent-red)" />}
                    </div>
                    {q.name && q.name !== sym && (
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{q.name}</div>
                    )}
                    <div className="metric-value" style={{ fontSize: 20, marginTop: 6 }}>
                      {sym.startsWith('^')
                        ? q.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                        : `₹${q.price.toFixed(2)}`}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {up ? '▲ +' : '▼ '}{q.changePercent.toFixed(2)}%
                      <span className="text-muted" style={{ marginLeft: 6, fontWeight: 400 }}>
                        {up ? '+' : ''}{q.change.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stocks grid ── */}
        <div className="dashboard-panel" style={{ marginBottom: 20 }}>
          <div className="dashboard-card-head">
            <h2>Indian equities</h2>
            <span>{STOCKS.length} securities · auto-refreshes every {REFRESH_INTERVAL}s</span>
          </div>
          <div className="grid-4">
            {STOCKS.map(({ symbol, label }) => {
              const q = quotes[symbol];
              const up = q ? q.change >= 0 : true;
              return (
                <div key={symbol} className="metric-card">
                  <div className="flex-between">
                    <div className="metric-label">{label}</div>
                    {q && (up
                      ? <TrendingUp size={15} color="var(--accent-green)" />
                      : <TrendingDown size={15} color="var(--accent-red)" />)}
                  </div>
                  {q ? (
                    <>
                      <div className="metric-value" style={{ fontSize: 20, marginTop: 6 }}>
                        ₹{q.price.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {up ? '▲ +' : '▼ '}{q.changePercent.toFixed(2)}%
                        <span className="text-muted" style={{ marginLeft: 6, fontWeight: 400 }}>
                          {up ? '+' : ''}{q.change.toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <span className="skeleton" style={{ display: 'inline-block', width: 80, height: 20, borderRadius: 4 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── MF NAV Lookup ── */}
        <div className="dashboard-panel">
          <div className="dashboard-card-head">
            <h2>MF NAV lookup</h2>
            <span>via AMFI codes</span>
          </div>
          <MFNavLookup />
        </div>

      </div>
    </AppShell>
  );
}

function MFNavLookup() {
  const [codes, setCodes] = useState('');
  const [navs, setNavs] = useState<Record<string, { nav: number; name: string; date: string }>>({});
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!codes.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/mf-nav?codes=${encodeURIComponent(codes.trim())}`);
      if (res.ok) setNavs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex gap-12" style={{ marginBottom: Object.keys(navs).length ? 16 : 0 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="AMFI codes, comma-separated — e.g. 119598,100020"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button className="btn btn-primary" onClick={lookup} disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : <><Search size={14} /> Lookup</>}
        </button>
      </div>
      {Object.keys(navs).length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>AMFI Code</th>
                <th>Fund Name</th>
                <th>NAV</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(navs).map(([code, data]) => (
                <tr key={code}>
                  <td className="text-secondary">{code}</td>
                  <td style={{ fontWeight: 500 }}>{data.name}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>₹{data.nav.toFixed(4)}</td>
                  <td className="text-secondary">{data.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
