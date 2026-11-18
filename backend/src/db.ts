import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from './config'

fs.mkdirSync(path.dirname(CONFIG.dbPath), { recursive: true })

export const db = new Database(CONFIG.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain      TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('php','node')),
  php_version TEXT,
  node_port   INTEGER,
  ssl_enabled INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS databases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id    INTEGER,
  name       TEXT NOT NULL UNIQUE,
  db_user    TEXT NOT NULL,
  db_pass    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mail_domains (
  domain TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS mail_boxes (
  address  TEXT PRIMARY KEY,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_aliases (
  address TEXT PRIMARY KEY,
  target  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)

// Migrasi kolom (idempoten) — fase 2: pengaturan deploy Node.js
const siteCols = new Set(
  (db.prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map((c) => c.name),
)
const migrations: Record<string, string> = {
  repo_url: 'TEXT',
  branch: "TEXT DEFAULT 'main'",
  node_version: 'TEXT',
  build_cmd: "TEXT DEFAULT ''",
  start_cmd: "TEXT DEFAULT ''",
  // fase htaccess: nginx (default) atau apache (kompatibel .htaccess)
  web_server: "TEXT NOT NULL DEFAULT 'nginx'",
  // fase 4: secret verifikasi webhook deploy
  deploy_secret: 'TEXT',
}
for (const [col, ddl] of Object.entries(migrations)) {
  if (!siteCols.has(col)) db.exec(`ALTER TABLE sites ADD COLUMN ${col} ${ddl}`)
}

// users migration — phase 4: TOTP 2FA
const userCols = new Set(
  (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name),
)
if (!userCols.has('totp_secret')) db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT')
if (!userCols.has('totp_enabled')) db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0')

/** Secret JWT dipersist di DB — restart tidak membatalkan sesi */
export function jwtSecret(): Buffer {
  const row = db.prepare(`SELECT value FROM meta WHERE key='jwt_secret'`).get() as { value: string } | undefined
  if (row) return Buffer.from(row.value, 'base64')
  const secret = crypto.randomBytes(32)
  db.prepare(`INSERT INTO meta (key, value) VALUES ('jwt_secret', ?)`).run(secret.toString('base64'))
  return secret
}

export function audit(action: string, detail?: unknown): void {
  db.prepare('INSERT INTO audit_log (action, detail) VALUES (?, ?)').run(action, JSON.stringify(detail ?? null))
}

/** Read a settings value from the meta table with a fallback */
export function getMeta(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

/** Upsert a settings value in the meta table */
export function setMeta(key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value)
}

export interface SiteRow {
  id: number
  domain: string
  type: 'php' | 'node'
  php_version: string | null
  node_port: number | null
  ssl_enabled: number
  created_at: string
  repo_url: string | null
  branch: string | null
  node_version: string | null
  build_cmd: string | null
  start_cmd: string | null
  web_server: string
  deploy_secret: string | null
}

/** Alokasi port internal untuk aplikasi Node (mulai 31001, periksa tabrakan) */
export function allocateNodePort(): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key='next_node_port'`).get() as { value: string } | undefined
  const used = new Set(
    (db.prepare('SELECT node_port FROM sites WHERE node_port IS NOT NULL').all() as { node_port: number }[]).map(r => r.node_port),
  )
  let port = row ? Number(row.value) : 31001
  while (used.has(port)) port++
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('next_node_port', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(port + 1))
  return port
}
