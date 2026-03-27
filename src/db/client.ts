import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import { mkdirSync } from 'fs'

const famDir = process.env.FAM_DIR
if (!famDir) {
  console.error('FAM_DIR environment variable is not set')
  process.exit(1)
}
const dbDir = path.join(famDir, 'db')
mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'family.db')
const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
