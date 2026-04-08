const BASE_URL = 'https://api.agentmail.to/v0';
const INBOX_ID = 'holdings@agentmail.to';

interface AgentMailMessage {
  message_id: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  preview?: string;
  labels?: string[];
  timestamp: string;
}

interface ListMessagesResponse {
  messages: AgentMailMessage[];
  count: number;
}

function getApiKey(): string {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error('AGENTMAIL_API_KEY not set');
  return key;
}

function headers(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

export async function listMessages(): Promise<AgentMailMessage[]> {
  const url = `${BASE_URL}/inboxes/${encodeURIComponent(INBOX_ID)}/messages`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail list messages failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as ListMessagesResponse;
  return data.messages || [];
}

export async function getMessage(messageId: string): Promise<AgentMailMessage> {
  const url = `${BASE_URL}/inboxes/${encodeURIComponent(INBOX_ID)}/messages/${encodeURIComponent(messageId)}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail get message failed (${res.status}): ${text}`);
  }

  return (await res.json()) as AgentMailMessage;
}

export async function sendMessage(to: string, subject: string, text: string): Promise<void> {
  const url = `${BASE_URL}/inboxes/${encodeURIComponent(INBOX_ID)}/messages/send`;
  const body = {
    to,
    subject,
    text,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const respText = await res.text();
    throw new Error(`AgentMail send failed (${res.status}): ${respText}`);
  }

  log(`Sent email to ${to}: "${subject}"`);
}

/** Extract bare email from "Name <email>" or plain "email" format */
export function extractEmail(fromField: string): string | null {
  const match = fromField.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // If it's just a bare email
  if (fromField.includes('@')) return fromField.trim().toLowerCase();
  return null;
}

/** Extract display name from "Name <email>" format */
export function extractName(fromField: string): string | null {
  const match = fromField.match(/^(.+?)\s*</);
  if (match) return match[1].trim();
  return null;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [AgentMail] ${msg}`);
}

export type { AgentMailMessage };
