import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, closeDatabase } from './db.js';
import { startScheduler } from './scheduler.js';
import { startWebhookServer, setWebhookSecret } from './webhook.js';
import { registerWebhook } from './agentmail.js';

// Graceful shutdown
function shutdown(): void {
  log('Shutting down...');
  closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Main] ${msg}`);
}

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

  // Start HTTP server for webhooks
  await startWebhookServer();

  // Register webhook with AgentMail
  const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.PUBLIC_URL;

  if (publicUrl) {
    try {
      const secret = await registerWebhook(`${publicUrl}/webhook`);
      setWebhookSecret(secret);
      log(`Webhook registered: ${publicUrl}/webhook`);
    } catch (err) {
      log(`Failed to register webhook: ${err}`);
      log('Emails will not be processed until webhook is registered');
    }
  } else {
    log('WARNING: No PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN set — webhook not registered');
    log('Set PUBLIC_URL env var to your Railway public URL');
  }

  // Start cron jobs for scheduled reports
  startScheduler();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
