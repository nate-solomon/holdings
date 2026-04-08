import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, getOrCreateUser, replaceHoldings, isMessageProcessed, markMessageProcessed, closeDatabase } from './db.js';
import { listMessages, AgentMailMessage } from './agentmail.js';
import { parseHoldings } from './parser.js';
import { sendConfirmation, sendParseError } from './reports.js';
import { startScheduler } from './scheduler.js';

const POLLING_INTERVAL = parseInt(process.env.AGENTMAIL_POLLING_INTERVAL_MS || '30000', 10);

let running = true;

async function processMessage(msg: AgentMailMessage): Promise<void> {
  const senderEmail = msg.from_;
  if (!senderEmail) {
    log(`Message ${msg.id} has no sender, skipping`);
    return;
  }

  log(`Processing email from ${senderEmail}: "${msg.subject}"`);

  const body = msg.text || msg.html || '';
  if (!body.trim()) {
    log(`Message ${msg.id} has no body, skipping`);
    return;
  }

  try {
    const holdings = await parseHoldings(body);

    if (holdings.length === 0) {
      log(`No holdings parsed from ${senderEmail}'s email`);
      await sendParseError(senderEmail);
      return;
    }

    const user = getOrCreateUser(senderEmail);
    replaceHoldings(user.id, holdings);

    log(`Updated holdings for ${senderEmail}: ${holdings.map(h => `${h.ticker}:${h.shares}`).join(', ')}`);

    await sendConfirmation(senderEmail, holdings);
  } catch (err) {
    log(`Error processing message from ${senderEmail}: ${err}`);
    try {
      await sendParseError(senderEmail);
    } catch (sendErr) {
      log(`Failed to send error reply: ${sendErr}`);
    }
  }
}

async function pollMessages(): Promise<void> {
  try {
    const messages = await listMessages();

    for (const msg of messages) {
      if (isMessageProcessed(msg.id)) continue;

      // Skip messages sent by ourselves
      if (msg.from_ === 'holdings@agentmail.to') {
        markMessageProcessed(msg.id);
        continue;
      }

      await processMessage(msg);
      markMessageProcessed(msg.id);
    }
  } catch (err) {
    log(`Polling error: ${err}`);
  }
}

async function startPolling(): Promise<void> {
  log(`Polling every ${POLLING_INTERVAL / 1000}s`);

  while (running) {
    await pollMessages();
    await sleep(POLLING_INTERVAL);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Main] ${msg}`);
}

// Graceful shutdown
function shutdown(): void {
  log('Shutting down...');
  running = false;
  closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
async function main(): Promise<void> {
  initDatabase();
  log('Portfolio tracker started');

  const etTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());
  log(`Current time in ET: ${etTime}`);
  log('Next reports scheduled at 10:00 AM ET and 6:00 PM ET');

  startScheduler();
  await startPolling();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
