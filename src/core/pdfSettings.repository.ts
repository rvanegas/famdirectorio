import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { pdfSettings } from '../db/schema'

const ROW_ID = 1
const INITIAL_VERSION = 3 // first generate will increment to 4

function ensureRow() {
  const existing = db.select().from(pdfSettings).where(sql`id = ${ROW_ID}`).get()
  if (!existing) {
    db.insert(pdfSettings).values({ id: ROW_ID, version: INITIAL_VERSION }).run()
  }
}

export function getNextVersion(): number {
  ensureRow()
  db.update(pdfSettings).set({ version: sql`version + 1` }).where(sql`id = ${ROW_ID}`).run()
  return db.select().from(pdfSettings).where(sql`id = ${ROW_ID}`).get()!.version
}

export function getCurrentVersion(): number {
  ensureRow()
  return db.select().from(pdfSettings).where(sql`id = ${ROW_ID}`).get()!.version
}

export function getUploadedVersion(): number | null {
  ensureRow()
  return db.select().from(pdfSettings).where(sql`id = ${ROW_ID}`).get()!.uploadedVersion ?? null
}

export function markUploaded(version: number): void {
  db.update(pdfSettings)
    .set({ uploadedVersion: version, uploadedAt: new Date().toISOString() })
    .where(sql`id = ${ROW_ID}`)
    .run()
}
