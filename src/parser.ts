import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a financial data parser. Extract portfolio holdings from user emails.
Users may write in any format — lists, sentences, tables, informal text.
Return ONLY a JSON array with no extra text. Each object must have:
{ "ticker": string (uppercase, e.g. "AAPL"), "shares": number }
For crypto use standard symbols (BTC, ETH, SOL, etc.).
If you cannot parse any holdings, return an empty array [].`;

interface ParsedHolding {
  ticker: string;
  shares: number;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export async function parseHoldings(emailBody: string): Promise<ParsedHolding[]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: emailBody },
    ],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const raw = textBlock.text.trim();
  log(`Claude response: ${raw}`);

  // Extract JSON array from response (handle markdown code blocks)
  let jsonStr = raw;
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array');
  }

  // Validate and normalize
  const holdings: ParsedHolding[] = [];
  for (const item of parsed) {
    if (typeof item.ticker === 'string' && typeof item.shares === 'number' && item.shares > 0) {
      holdings.push({
        ticker: item.ticker.toUpperCase().trim(),
        shares: item.shares,
      });
    }
  }

  return holdings;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Parser] ${msg}`);
}
