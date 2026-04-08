import { getAllUsersWithHoldings, Holding } from './db.js';
import { fetchPrices, PriceData } from './prices.js';
import { sendMessage } from './agentmail.js';

export async function sendAllReports(): Promise<void> {
  const users = getAllUsersWithHoldings();
  log(`Sending reports to ${users.length} user(s)`);

  for (const user of users) {
    try {
      await sendReport(user.email, user.holdings);
      log(`Report sent to ${user.email}`);
    } catch (err) {
      log(`Failed to send report to ${user.email}: ${err}`);
    }
  }
}

async function sendReport(email: string, holdings: Holding[]): Promise<void> {
  const tickers = holdings.map(h => h.ticker);
  const prices = await fetchPrices(tickers);

  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const etTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateStr = etFormatter.format(now);
  const timeStr = etTimeFormatter.format(now);

  const subject = `Portfolio Report — ${dateStr} ${timeStr} ET`;

  // Build holdings lines
  const lines: string[] = [];
  let totalValue = 0;
  let hasAnyPrice = false;

  for (const h of holdings) {
    const pd = prices.get(h.ticker);
    const line = formatHoldingLine(h, pd);
    lines.push(line);

    if (pd?.price !== null && pd?.price !== undefined) {
      totalValue += pd.price * h.shares;
      hasAnyPrice = true;
    }
  }

  const holdingsBlock = lines.join('\n');
  const totalStr = hasAnyPrice ? `$${formatNumber(totalValue)}` : 'N/A';

  const body = `PORTFOLIO REPORT
${dateStr} • ${timeStr} ET
─────────────────────────────────

HOLDINGS

${holdingsBlock}

─────────────────────────────────
TOTAL VALUE:   ${totalStr}

─────────────────────────────────
Reply to this email to update your holdings at any time.
Format: "AAPL 100, TSLA 50, BTC 0.5" or any natural language.`;

  await sendMessage(email, subject, body);
}

function formatHoldingLine(h: Holding, pd: PriceData | undefined): string {
  const ticker = h.ticker.padEnd(8);
  const shares = `${h.shares} shares`.padEnd(14);

  if (!pd || pd.price === null) {
    return `${ticker}${shares}   N/A          N/A          N/A`;
  }

  const priceStr = `$${formatNumber(pd.price)}`.padEnd(14);
  const value = pd.price * h.shares;
  const valueStr = `$${formatNumber(value)}`.padEnd(14);

  let changeStr: string;
  if (pd.changePercent !== null) {
    const arrow = pd.changePercent >= 0 ? '▲' : '▼';
    const sign = pd.changePercent >= 0 ? '+' : '';
    changeStr = `${sign}${pd.changePercent.toFixed(2)}% ${arrow}`;
  } else {
    changeStr = 'N/A';
  }

  return `${ticker}${shares}${priceStr}${valueStr}${changeStr}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function sendConfirmation(email: string, holdings: Holding[]): Promise<void> {
  const holdingsList = holdings.map(h => `• ${h.ticker} — ${h.shares} shares`).join('\n');

  const body = `Your portfolio has been updated!

Current holdings:
${holdingsList}

You'll receive reports at 10:00 AM and 6:00 PM ET daily.
Reply anytime to update your holdings.`;

  await sendMessage(email, 'Holdings Updated ✓', body);
}

export async function sendParseError(email: string): Promise<void> {
  const body = `Sorry, I couldn't understand your holdings. Try formats like:

• "AAPL 100 shares, TSLA 50, BTC 0.5"
• "I own 100 Apple, 50 Tesla, and half a bitcoin"
• Ticker: AAPL, Shares: 100

Reply with your holdings and I'll update them right away.`;

  await sendMessage(email, "Couldn't parse your holdings", body);
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Reports] ${msg}`);
}
