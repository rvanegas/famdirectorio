import { db } from '../db/client'
import { members } from '../db/schema'
import { eq, like } from 'drizzle-orm'
import { relationships } from '../db/schema'
import type { Member } from './types'

function toMember(row: typeof members.$inferSelect): Member {
  return {
    ...row,
    attended2023: row.attended2023 === 1,
    isAlive: row.isAlive === 1,
  }
}

export function findById(id: number): Member | null {
  const row = db.select().from(members).where(eq(members.id, id)).get()
  return row ? toMember(row) : null
}

export function findAll(): Member[] {
  return db.select().from(members).all().map(toMember)
}

export function findByGeneration(generation: number): Member[] {
  const parentMap = new Map<number, number>()
  for (const rel of db.select().from(relationships).all()) {
    if (rel.type === 'child') parentMap.set(rel.toMemberId, rel.fromMemberId)
  }
  function depth(id: number): number {
    let d = 1
    let cur: number | undefined = id
    while ((cur = parentMap.get(cur)) !== undefined) d++
    return d
  }
  return db.select().from(members).all().filter(r => depth(r.id) === generation).map(toMember)
}

export function findByCity(city: string): Member[] {
  return db
    .select()
    .from(members)
    .where(like(members.city, `%${city}%`))
    .all()
    .map(toMember)
}

export function create(data: Omit<Member, 'id'> & { id?: number }): Member {
  const result = db
    .insert(members)
    .values({
      ...data,
      attended2023: data.attended2023 ? 1 : 0,
      isAlive: data.isAlive ? 1 : 0,
    })
    .returning()
    .get()
  return toMember(result)
}

export function update(id: number, data: Partial<Omit<Member, 'id'>>): Member | null {
  const { attended2023, isAlive, ...rest } = data
  const row = db
    .update(members)
    .set({
      ...rest,
      ...(attended2023 !== undefined ? { attended2023: attended2023 ? 1 : 0 } : {}),
      ...(isAlive !== undefined ? { isAlive: isAlive ? 1 : 0 } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(members.id, id))
    .returning()
    .get()
  return row ? toMember(row) : null
}

export function remove(id: number): boolean {
  const result = db.delete(members).where(eq(members.id, id)).run()
  return result.changes > 0
}
