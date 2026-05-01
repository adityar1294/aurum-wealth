'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { Search, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { formatINR } from '@/lib/currency';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

const PRESET_SYMBOLS = [
  { symbol: '^NSEI', label: 'Nifty 50' },
  { symbol: '^BSESN', label: 'Sensex' },
  { symbol: 'RELIANCE.NS', label: 'Reliance' },
  { symbol: 'HDFCBANK.NS', label: 'HDFC Bank' },
  { symbol: 'INFY.NS', label: 'Infosys' },
  { symbol: 'TCS.NS', label: 'TCS' },
  { symbol: 'ICICIBANK.NS', label: 'ICICI Bank' },
  { symbol: 'KOTAKBANK.NS', label: 'Kotak Bank' },
  { symbol: 'AXISBANK.NS', label: 'Axis Bank' },
  { symbol: 'SBIN.NS', label: 'SBI' },
  { symbol: 'BAJFINANCE.NS', label: 'Bajaj Finance' },
  { symbol: 'WIPRO.NS', label: 'Wipro' },
];

export default function MarketResearchPage() {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(false);

  const fetchQuotes = async (symbols: string[]) => {
    if (!symbols.length) return;
    try {
      const res = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`);
      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPresets = async () => {
    setLoadingPresets(true);
    await fetchQuotes(PRESET_SYMBOLS.map((s) => s.symbol));
    setLoadingPresets(false);
  };

  const searchStock = async () => {
    if (!searchSymbol.trim()) return;
    setLoading(true);
    const sym = searchSymbol.trim().toUpperCase();
    const variants = [sym, `${sym}.NS`, `${sym}.BO`];
    await fetchQuotes(variants);
    setLoading(false);
  };

  const QuoteCard = ({ symbol, label, quote }: { symbol: string; label: string; quote?: Quote }) => {
    const up = quote ? quote.change >= 0 : true;
    return (
      <div className="metric-card">
        <div className="flex-between">
          <div>
            <div className="metric-label">{label || symbol}</div>
            {quote && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{quote.name !== symbol ? quote.name : ''}</div>}
          </div>
          {quote && (up ? <TrendingUp size={18} color="var(--accent-green)" /> : <TrendingDown size={18} color="var(--accent-red)" />)}
        </div>
        {quote ? (
          <>
            <div className="metric-value" style={{ fontSize: 22, marginTop: 8 }}>
              {symbol.startsWith('^') ? quote.price.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : `₹${quote.price.toFixed(2)}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {up ? '+' : ''}{quote.change.toFixed(2)} ({up ? '+' : ''}{quote.changePercent.toFixed(2)}%)
            </div>
          </>
        ) : (
          <div className="metric-value" style={{ fontSize: 22, color: 'var(--text-muted)', marginTop: 8 }}>—</div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Market Research</h1>
            <p className="page-subtitle">Real-time stock & index quotes via Yahoo Finance</p>
          </div>
          <button className="btn btn-secondary" onClick={loadPresets} disabled={loadingPresets}>
            <RefreshCw size={14} /> Load Market Data
          </button>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 className="card-title" style={{ marginBottom: 16 }}>Search Symbol</h2>
          <div className="flex gap-12">
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Enter symbol: RELIANCE, HDFC, NIFTY50, AAPL, TSLA…"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchStock()}
            />
            <button className="btn btn-primary" onClick={searchStock} disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : <><Search size={15} /> Search</>}
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Add .NS for NSE (e.g., RELIANCE.NS), .BO for BSE, use ^ prefix for indices (^NSEI = Nifty 50)
          </p>
        </div>

        {Object.keys(quotes).length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Search Results</h2>
            <div className="grid-4">
              {Object.entries(quotes)
                .filter(([sym]) => !PRESET_SYMBOLS.map((p) => p.symbol).includes(sym))
                .map(([sym, quote]) => (
                  <QuoteCard key={sym} symbol={sym} label={sym} quote={quote} />
                ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Indian Markets</h2>
          </div>
          <div className="grid-4">
            {PRESET_SYMBOLS.map(({ symbol, label }) => (
              <QuoteCard key={symbol} symbol={symbol} label={label} quote={quotes[symbol]} />
            ))}
          </div>
        </div>

        <div className="card mt-24">
          <h2 className="card-title" style={{ marginBottom: 16 }}>MF NAV Lookup</h2>
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
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex gap-12" style={{ marginBottom: 16 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Enter AMFI codes (comma-separated): 119598,100020"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button className="btn btn-primary" onClick={lookup} disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : <><Search size={15} /> Lookup</>}
        </button>
      </div>
      {Object.keys(navs).length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>AMFI Code</th><th>Fund Name</th><th>NAV</th><th>As of Date</th></tr></thead>
            <tbody>
              {Object.entries(navs).map(([code, data]) => (
                <tr key={code}>
                  <td className="text-secondary">{code}</td>
                  <td style={{ fontWeight: 500 }}>{data.name}</td>
                  <td style={{ fontWeight: 700 }}>₹{data.nav.toFixed(4)}</td>
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
