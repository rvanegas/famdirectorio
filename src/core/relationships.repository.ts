import { db } from '../db/client'
import { relationships, members } from '../db/schema'
import { eq, or } from 'drizzle-orm'
import type { Relationship } from './types'

function toRelationship(row: typeof relationships.$inferSelect): Relationship {
  return {
    ...row,
    type: row.type as Relationship['type'],
  }
}

export function findAll(): Relationship[] {
  return db.select().from(relationships).all().map(toRelationship)
}

export function findByMember(memberId: number): Relationship[] {
  return db
    .select()
    .from(relationships)
    .where(or(eq(relationships.fromMemberId, memberId), eq(relationships.toMemberId, memberId)))
    .all()
    .map(toRelationship)
}

export function findChildren(memberId: number): Relationship[] {
  return db
    .select()
    .from(relationships)
    .where(eq(relationships.fromMemberId, memberId))
    .all()
    .filter((r) => r.type === 'child')
    .map(toRelationship)
}

export function findParent(memberId: number): Relationship | null {
  const row = db
    .select()
    .from(relationships)
    .where(eq(relationships.toMemberId, memberId))
    .all()
    .find((r) => r.type === 'child')
  return row ? toRelationship(row) : null
}

export function create(
  fromMemberId: number,
  toMemberId: number,
  type: Relationship['type'],
  notes?: string,
): Relationship {
  const result = db
    .insert(relationships)
    .values({ fromMemberId, toMemberId, type, notes: notes ?? null })
    .returning()
    .get()
  return toRelationship(result)
}

export function remove(id: number): boolean {
  const result = db.delete(relationships).where(eq(relationships.id, id)).run()
  return result.changes > 0
}
