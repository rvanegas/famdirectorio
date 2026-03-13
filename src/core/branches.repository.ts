import { db } from '../db/client'
import { branches, members } from '../db/schema'
import { eq, like } from 'drizzle-orm'
import type { Branch, Member } from './types'

function toMember(row: typeof members.$inferSelect): Member {
  return {
    ...row,
    attended2023: row.attended2023 === 1,
    isAlive: row.isAlive === 1,
  }
}

export function findAll(): Branch[] {
  return db.select().from(branches).all()
}

export function findById(id: number): Branch | null {
  return db.select().from(branches).where(eq(branches.id, id)).get() ?? null
}

export function findByName(name: string): Branch | null {
  return (
    db
      .select()
      .from(branches)
      .where(like(branches.name, `%${name}%`))
      .get() ?? null
  )
}

export function findMembersInBranch(branchId: number): Member[] {
  return db
    .select()
    .from(members)
    .where(eq(members.branchId, branchId))
    .all()
    .map(toMember)
}

export function update(id: number, data: Partial<Omit<Branch, 'id'>>): Branch | null {
  return (
    db.update(branches).set(data).where(eq(branches.id, id)).returning().get() ?? null
  )
}
