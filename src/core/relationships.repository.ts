import { db } from '../db/client'
import { relationships } from '../db/schema'
import { and, eq, or } from 'drizzle-orm'
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

export function findSiblings(memberId: number): number[] {
  const parentIds = db
    .select()
    .from(relationships)
    .where(and(eq(relationships.toMemberId, memberId), eq(relationships.type, 'child')))
    .all()
    .map((r) => r.fromMemberId)

  if (parentIds.length === 0) return []

  const siblingIds = new Set<number>()
  for (const parentId of parentIds) {
    db.select()
      .from(relationships)
      .where(and(eq(relationships.fromMemberId, parentId), eq(relationships.type, 'child')))
      .all()
      .forEach((r) => { if (r.toMemberId !== memberId) siblingIds.add(r.toMemberId) })
  }
  return [...siblingIds]
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

export function findByPair(
  memberA: number,
  memberB: number,
  type?: Relationship['type'],
): Relationship[] {
  const forward = and(eq(relationships.fromMemberId, memberA), eq(relationships.toMemberId, memberB))
  const reverse = and(eq(relationships.fromMemberId, memberB), eq(relationships.toMemberId, memberA))
  return db
    .select()
    .from(relationships)
    .where(type ? and(or(forward, reverse), eq(relationships.type, type)) : or(forward, reverse))
    .all()
    .map(toRelationship)
}

export function remove(id: number): boolean {
  const result = db.delete(relationships).where(eq(relationships.id, id)).run()
  return result.changes > 0
}
