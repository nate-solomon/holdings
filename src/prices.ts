// @ts-ignore - yahoo-finance2 type compatibility
import yahooFinance from 'yahoo-finance2';
import { getCachedPrice, setCachedPrice } from './db.js';

export interface PriceData {
  ticker: string;
  price: number | null;
  prevClose: number | null;
  changePercent: number | null;
}

// Crypto tickers need special suffixes for Yahoo Finance
const CRYPTO_TICKERS: Record<string, string> = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  ADA: 'ADA-USD',
  DOT: 'DOT-USD',
  DOGE: 'DOGE-USD',
  XRP: 'XRP-USD',
  AVAX: 'AVAX-USD',
  MATIC: 'MATIC-USD',
  LINK: 'LINK-USD',
  UNI: 'UNI-USD',
  ATOM: 'ATOM-USD',
  LTC: 'LTC-USD',
  BCH: 'BCH-USD',
  ALGO: 'ALGO-USD',
  FIL: 'FIL-USD',
  NEAR: 'NEAR-USD',
  APT: 'APT-USD',
  ARB: 'ARB-USD',
  OP: 'OP-USD',
  SUI: 'SUI-USD',
  SEI: 'SEI-USD',
  TIA: 'TIA-USD',
  PEPE: 'PEPE-USD',
  SHIB: 'SHIB-USD',
  BONK: 'BONK-USD',
  WIF: 'WIF-USD',
};

function getYahooSymbol(ticker: string): string {
  return CRYPTO_TICKERS[ticker.toUpperCase()] || ticker;
}

export async function fetchPrice(ticker: string): Promise<PriceData> {
  // Check cache first
  const cached = getCachedPrice(ticker);
  if (cached) {
    const changePercent = cached.prev_close
      ? ((cached.price - cached.prev_close) / cached.prev_close) * 100
      : null;
    return {
      ticker,
      price: cached.price,
      prevClose: cached.prev_close,
      changePercent,
    };
  }

  try {
    const symbol = getYahooSymbol(ticker);
    const quote = await (yahooFinance as any).quote(symbol);

    const price = quote.regularMarketPrice ?? null;
    const prevClose = quote.regularMarketPreviousClose ?? null;

    if (price !== null && prevClose !== null) {
      setCachedPrice(ticker, price, prevClose);
    }

    const changePercent = price !== null && prevClose !== null && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null;

    return { ticker, price, prevClose, changePercent };
  } catch (err) {
    log(`Failed to fetch price for ${ticker}: ${err}`);
    return { ticker, price: null, prevClose: null, changePercent: null };
  }
}

export async function fetchPrices(tickers: string[]): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();

  // Fetch in parallel with concurrency limit
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const prices = await Promise.all(batch.map(t => fetchPrice(t)));
    for (const p of prices) {
      results.set(p.ticker, p);
    }
  }

  return results;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Prices] ${msg}`);
}
