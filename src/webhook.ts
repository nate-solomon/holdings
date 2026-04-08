import express from 'express';
import { Webhook } from 'svix';
import { isMessageProcessed, markMessageProcessed, getOrCreateUser, replaceHoldings } from './db.js';
import { extractEmail, extractName, getMessage } from './agentmail.js';
import { parseHoldings } from './parser.js';
import { sendConfirmation, sendParseError } from './reports.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

interface WebhookMessagePayload {
  type: string;
  event_type: string;
  event_id: string;
  message: {
    message_id: string;
    inbox_id: string;
    from: string;
    to: string[];
    subject?: string;
    text?: string;
    html?: string;
    preview?: string;
    labels?: string[];
  };
}

let webhookSecret: string | null = null;

export function setWebhookSecret(secret: string): void {
  webhookSecret = secret;
}

async function handleIncomingMessage(payload: WebhookMessagePayload): Promise<void> {
  const msg = payload.message;

  if (isMessageProcessed(msg.message_id)) {
    log(`Message ${msg.message_id} already processed, skipping`);
    return;
  }

  // Skip our own outbound messages
  const senderEmail = extractEmail(msg.from);
  if (!senderEmail || senderEmail === 'holdings@agentmail.to') {
    markMessageProcessed(msg.message_id);
    return;
  }

  if (msg.labels && msg.labels.includes('sent')) {
    markMessageProcessed(msg.message_id);
    return;
  }

  const senderName = extractName(msg.from);
  log(`Processing email from ${senderEmail}: "${msg.subject}"`);

  // Webhook payload may not include full text — fetch full message if needed
  let body = msg.text || msg.html || '';
  if (!body.trim()) {
    log(`Webhook payload missing text, fetching full message ${msg.message_id}`);
    try {
      const fullMsg = await getMessage(msg.message_id);
      body = (fullMsg as any).text || (fullMsg as any).html || msg.preview || '';
    } catch (fetchErr) {
      log(`Failed to fetch full message: ${fetchErr}, using preview`);
      body = msg.preview || '';
    }
  }
  if (!body.trim()) {
    log(`Message ${msg.message_id} has no body, skipping`);
    markMessageProcessed(msg.message_id);
    return;
  }
  log(`Email body: "${body.substring(0, 200)}"`);

  try {
    const holdings = await parseHoldings(body);

    if (holdings.length === 0) {
      log(`No holdings parsed from ${senderEmail}'s email`);
      await sendParseError(senderEmail);
      markMessageProcessed(msg.message_id);
      return;
    }

    const user = getOrCreateUser(senderEmail, senderName || undefined);
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

  markMessageProcessed(msg.message_id);
}

export function startWebhookServer(): Promise<void> {
  return new Promise((resolve) => {
    const app = express();

    // Need raw body for svix signature verification
    app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
      // Verify signature if we have the secret
      if (webhookSecret) {
        try {
          const wh = new Webhook(webhookSecret);
          const headers_obj = {
            'svix-id': req.headers['svix-id'] as string,
            'svix-signature': req.headers['svix-signature'] as string,
            'svix-timestamp': req.headers['svix-timestamp'] as string,
          };
          wh.verify(req.body.toString(), headers_obj);
        } catch (err) {
          log(`Webhook signature verification failed: ${err}`);
          res.status(401).send('Invalid signature');
          return;
        }
      }

      const payload = JSON.parse(req.body.toString()) as WebhookMessagePayload;
      log(`Webhook received: ${payload.event_type} for message ${payload.message?.message_id}`);

      // Respond immediately, process async
      res.status(200).send('ok');

      if (payload.event_type === 'message.received') {
        try {
          await handleIncomingMessage(payload);
        } catch (err) {
          log(`Webhook handler error: ${err}`);
        }
      }
    });

    // Health check
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    app.listen(PORT, () => {
      log(`Webhook server listening on port ${PORT}`);
      resolve();
    });
  });
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Webhook] ${msg}`);
}
