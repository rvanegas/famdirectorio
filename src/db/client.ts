import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import os from 'os'
import { mkdirSync } from 'fs'

const dbDir = path.join(os.homedir(), 'src', 'fam', 'db')
mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'family.db')
const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
