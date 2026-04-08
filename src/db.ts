import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'portfolio.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      ticker      TEXT NOT NULL,
      shares      REAL NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id   TEXT PRIMARY KEY,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      ticker      TEXT PRIMARY KEY,
      price       REAL,
      prev_close  REAL,
      fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  log('Database initialized');
}

export interface Holding {
  ticker: string;
  shares: number;
}

export interface UserRecord {
  id: number;
  email: string;
  name: string | null;
}

export function getOrCreateUser(email: string, name?: string): UserRecord {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
  if (existing) return existing;

  const result = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)').run(email, name || null);
  return { id: result.lastInsertRowid as number, email, name: name || null };
}

export function replaceHoldings(userId: number, holdings: Holding[]): void {
  const deleteStmt = db.prepare('DELETE FROM holdings WHERE user_id = ?');
  const insertStmt = db.prepare('INSERT INTO holdings (user_id, ticker, shares) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    deleteStmt.run(userId);
    for (const h of holdings) {
      insertStmt.run(userId, h.ticker, h.shares);
    }
  });
  transaction();
}

export function getUserHoldings(userId: number): Holding[] {
  return db.prepare('SELECT ticker, shares FROM holdings WHERE user_id = ?').all(userId) as Holding[];
}

export function getAllUsersWithHoldings(): (UserRecord & { holdings: Holding[] })[] {
  const users = db.prepare(`
    SELECT DISTINCT u.* FROM users u
    JOIN holdings h ON h.user_id = u.id
  `).all() as UserRecord[];

  return users.map(u => ({
    ...u,
    holdings: getUserHoldings(u.id),
  }));
}

export function isMessageProcessed(messageId: string): boolean {
  const row = db.prepare('SELECT 1 FROM processed_messages WHERE message_id = ?').get(messageId);
  return !!row;
}

export function markMessageProcessed(messageId: string): void {
  db.prepare('INSERT OR IGNORE INTO processed_messages (message_id) VALUES (?)').run(messageId);
}

export interface CachedPrice {
  ticker: string;
  price: number;
  prev_close: number;
  fetched_at: string;
}

export function getCachedPrice(ticker: string, maxAgeMs: number = 15 * 60 * 1000): CachedPrice | null {
  const row = db.prepare('SELECT * FROM price_cache WHERE ticker = ?').get(ticker) as CachedPrice | undefined;
  if (!row) return null;

  const age = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  if (age > maxAgeMs) return null;

  return row;
}

export function setCachedPrice(ticker: string, price: number, prevClose: number): void {
  db.prepare(`
    INSERT INTO price_cache (ticker, price, prev_close, fetched_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(ticker) DO UPDATE SET
      price = excluded.price,
      prev_close = excluded.prev_close,
      fetched_at = excluded.fetched_at
  `).run(ticker, price, prevClose);
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [DB] ${msg}`);
}

export function closeDatabase(): void {
  db.close();
  log('Database closed');
}

export default db;
