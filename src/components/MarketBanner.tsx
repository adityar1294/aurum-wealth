'use client';
import { useEffect, useState } from 'react';

const SYMBOLS = ['^NSEI', '^BSESN', 'RELIANCE.NS', 'HDFCBANK.NS', 'INFY.NS', 'TCS.NS', 'WIPRO.NS', 'ICICIBANK.NS'];
const LABELS: Record<string, string> = {
  '^NSEI': 'Nifty 50',
  '^BSESN': 'Sensex',
  'RELIANCE.NS': 'Reliance',
  'HDFCBANK.NS': 'HDFC Bank',
  'INFY.NS': 'Infosys',
  'TCS.NS': 'TCS',
  'WIPRO.NS': 'Wipro',
  'ICICIBANK.NS': 'ICICI Bank',
};

interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

function TickerPill({ sym, quote }: { sym: string; quote: Quote | undefined }) {
  const up = quote ? quote.change >= 0 : true;
  const label = LABELS[sym] ?? sym;

  return (
    <div className="market-ticker-pill">
      <span className="ticker-sym">{label}</span>
      {quote ? (
        <>
          <span className="ticker-px">
            {sym.startsWith('^')
              ? quote.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })
              : `₹${quote.price.toFixed(2)}`}
          </span>
          <span className={`ticker-chg ${up ? 'ticker-up' : 'ticker-down'}`}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{quote.changePercent.toFixed(2)}%
          </span>
        </>
      ) : (
        <span className="skeleton" style={{ width: 70, height: 12, display: 'inline-block', borderRadius: 6 }} />
      )}
    </div>
  );
}

export default function MarketBanner() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const fetchQuotes = async () => {
    try {
      const res = await fetch(`/api/prices?symbols=${SYMBOLS.join(',')}`);
      if (res.ok) setQuotes(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="market-banner-wrap">
      {/* LIVE badge — absolutely positioned, track has padding-left to clear it */}
      <div className="market-banner-live">
        <span className="market-banner-live-dot" />
        LIVE
      </div>

      {/* Seamless marquee: duplicate the list so the loop is invisible */}
      <div className="market-ticker-track">
        {[...SYMBOLS, ...SYMBOLS].map((sym, i) => (
          <TickerPill key={`${sym}-${i}`} sym={sym} quote={quotes[sym]} />
        ))}
      </div>
    </div>
  );
}
