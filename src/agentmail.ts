const BASE_URL = 'https://api.agentmail.to/v0';
const INBOX_USERNAME = 'holdings@agentmail.to';

interface AgentMailMessage {
  id: string;
  from_: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  created_at: string;
}

interface ListMessagesResponse {
  messages: AgentMailMessage[];
  cursor?: string;
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
  const url = `${BASE_URL}/inboxes/${INBOX_USERNAME}/messages`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail list messages failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as ListMessagesResponse;
  return data.messages || [];
}

export async function getMessage(messageId: string): Promise<AgentMailMessage> {
  const url = `${BASE_URL}/inboxes/${INBOX_USERNAME}/messages/${messageId}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail get message failed (${res.status}): ${text}`);
  }

  return (await res.json()) as AgentMailMessage;
}

export async function sendMessage(to: string, subject: string, text: string): Promise<void> {
  const url = `${BASE_URL}/inboxes/${INBOX_USERNAME}/messages`;
  const body = {
    to: [to],
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

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [AgentMail] ${msg}`);
}

export type { AgentMailMessage };
