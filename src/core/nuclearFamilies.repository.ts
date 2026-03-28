import { db } from '../db/client'
import { nuclearFamilies } from '../db/schema'
import { eq, or } from 'drizzle-orm'

export type NuclearFamilyRow = typeof nuclearFamilies.$inferSelect

export function findAll(): NuclearFamilyRow[] {
  return db.select().from(nuclearFamilies).all()
}

export function findById(id: number): NuclearFamilyRow | null {
  return db.select().from(nuclearFamilies).where(eq(nuclearFamilies.id, id)).get() ?? null
}

export function findByParent(memberId: number): NuclearFamilyRow[] {
  return db.select().from(nuclearFamilies).where(
    or(eq(nuclearFamilies.parent1Id, memberId), eq(nuclearFamilies.parent2Id, memberId))
  ).all()
}

export function findByParents(parentIds: number[]): NuclearFamilyRow[] {
  if (parentIds.length === 0) return []
  const seen = new Set<number>()
  const result: NuclearFamilyRow[] = []
  for (const pid of parentIds) {
    for (const f of findByParent(pid)) {
      if (!seen.has(f.id)) {
        seen.add(f.id)
        result.push(f)
      }
    }
  }
  return result
}
