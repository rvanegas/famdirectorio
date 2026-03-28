import { db } from '../db/client'
import { nuclearFamilies } from '../db/schema'
import { eq } from 'drizzle-orm'

export type NuclearFamilyRow = typeof nuclearFamilies.$inferSelect

export function findById(id: number): NuclearFamilyRow | null {
  return db.select().from(nuclearFamilies).where(eq(nuclearFamilies.id, id)).get() ?? null
}
