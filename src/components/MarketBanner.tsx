'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const SYMBOLS = ['^NSEI', '^BSESN', 'RELIANCE.NS', 'HDFCBANK.NS', 'INFY.NS', 'TCS.NS'];
const LABELS: Record<string, string> = {
  '^NSEI': 'Nifty 50',
  '^BSESN': 'Sensex',
  'RELIANCE.NS': 'Reliance',
  'HDFCBANK.NS': 'HDFC Bank',
  'INFY.NS': 'Infosys',
  'TCS.NS': 'TCS',
};

interface Quote {
  price: number;
  change: number;
  changePercent: number;
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
    <div className="market-banner">
      {SYMBOLS.map((sym) => {
        const q = quotes[sym];
        const up = q ? q.change >= 0 : true;
        return (
          <div key={sym} className="market-ticker">
            <span className="ticker-name">{LABELS[sym]}</span>
            {q ? (
              <>
                <span className="ticker-price">
                  {sym.startsWith('^') ? q.price.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : `₹${q.price.toFixed(2)}`}
                </span>
                <span className={`ticker-change ${up ? 'ticker-up' : 'ticker-down'}`}>
                  {up ? <TrendingUp size={12} style={{ display: 'inline' }} /> : <TrendingDown size={12} style={{ display: 'inline' }} />}{' '}
                  {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="skeleton" style={{ width: 80, height: 14, display: 'inline-block' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
