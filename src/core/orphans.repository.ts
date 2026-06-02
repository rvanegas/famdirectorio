import { db } from '../db/client'
import { orphans } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Orphan } from './types'

export function findAll(): Orphan[] {
  return db.select().from(orphans).all() as Orphan[]
}

export function create(data: { firstName: string; lastName?: string | null; birthday?: string | null }): Orphan {
  const rows = db.insert(orphans).values(data).returning().all()
  return rows[0] as Orphan
}

export function remove(id: number): boolean {
  const rows = db.delete(orphans).where(eq(orphans.id, id)).returning().all()
  return rows.length > 0
}
