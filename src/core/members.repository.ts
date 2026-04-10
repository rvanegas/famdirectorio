import { db, sqlite } from '../db/client'
import { members } from '../db/schema'
import { and, eq, gte, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm'
import { relationships } from '../db/schema'
import type { Member } from './types'
import path from 'path'

function normalizePhotoPath(p: string | null | undefined): string | null | undefined {
  if (!p) return p
  if (!path.isAbsolute(p)) return p
  const famDir = process.env.FAM_DIR
  if (!famDir) return p
  return path.relative(famDir, p)
}

function toMember(row: typeof members.$inferSelect): Member {
  return {
    ...row,
    attended2023: row.attended2023 === 1,
    isAlive: row.isAlive === 1,
    isRoot: row.isRoot === 1,
  }
}

export function findById(id: number): Member | null {
  const row = db.select().from(members).where(eq(members.id, id)).get()
  return row ? toMember(row) : null
}

export function findAll(): Member[] {
  return db.select().from(members).all().map(toMember)
}

function buildDepthFn(): (id: number) => number {
  const allMembers = db.select().from(members).all()
  const rootSet = new Set(allMembers.filter(m => m.isRoot === 1).map(m => m.id))
  const parentMap = new Map<number, number>()
  const spouseMap = new Map<number, number[]>()
  for (const rel of db.select().from(relationships).all()) {
    if (rel.type === 'child') {
      parentMap.set(rel.toMemberId, rel.fromMemberId)
    } else if (rel.type === 'spouse') {
      for (const [a, b] of [[rel.fromMemberId, rel.toMemberId], [rel.toMemberId, rel.fromMemberId]]) {
        if (!spouseMap.has(a)) spouseMap.set(a, [])
        spouseMap.get(a)!.push(b)
      }
    }
  }
  function depth(id: number, visited = new Set<number>()): number {
    if (rootSet.has(id)) return 1
    visited.add(id)
    const parent = parentMap.get(id)
    if (parent !== undefined) {
      return 1 + depth(parent, new Set(visited))
    }
    // No parent — inherit generation from spouse
    for (const spouseId of spouseMap.get(id) ?? []) {
      if (!visited.has(spouseId)) return depth(spouseId, visited)
    }
    return 1
  }
  return depth
}

export function findByGeneration(generation: number): Member[] {
  return db.select().from(members).where(eq(members.generation, generation)).all().map(toMember)
}

export function getGeneration(id: number): number {
  return db.select({ generation: members.generation }).from(members).where(eq(members.id, id)).get()?.generation ?? 1
}

export function computeAllGenerations(): Map<number, number> {
  const depth = buildDepthFn()
  return new Map(db.select({ id: members.id }).from(members).all().map(r => [r.id, depth(r.id)]))
}

export function syncGenerations(): number {
  const depth = buildDepthFn()
  const all = db.select().from(members).all()
  for (const m of all) {
    db.update(members).set({ generation: depth(m.id) }).where(eq(members.id, m.id)).run()
  }
  return all.length
}

export function search(text: string): Member[] {
  const pattern = `%${text.toLowerCase()}%`
  return db
    .select()
    .from(members)
    .where(
      or(
        sql`lower(${members.firstName} || ' ' || coalesce(${members.lastName}, '')) like ${pattern}`,
        sql`lower(coalesce(${members.email}, '')) like ${pattern}`,
      ),
    )
    .all()
    .map(toMember)
}

export function findUnverifiedSince(date: string): Member[] {
  const candidates = db
    .select()
    .from(members)
    .where(or(isNull(members.descVerifiedAt), lt(members.descVerifiedAt, date)))
    .all()
    .map(toMember)

  const verifiedIds = new Set(
    db.select({ id: members.id })
      .from(members)
      .where(and(isNotNull(members.descVerifiedAt), gte(members.descVerifiedAt, date)))
      .all()
      .map(r => r.id)
  )

  const parentMap = new Map<number, number>()
  for (const rel of db.select().from(relationships).where(eq(relationships.type, 'child')).all()) {
    parentMap.set(rel.toMemberId, rel.fromMemberId)
  }

  function hasVerifiedAncestor(id: number): boolean {
    const visited = new Set<number>()
    let cur = parentMap.get(id)
    while (cur !== undefined && !visited.has(cur)) {
      if (verifiedIds.has(cur)) return true
      visited.add(cur)
      cur = parentMap.get(cur)
    }
    return false
  }

  return candidates.filter(m => !hasVerifiedAncestor(m.id))
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
      photoPath: normalizePhotoPath(data.photoPath),
      attended2023: data.attended2023 ? 1 : 0,
      isAlive: data.isAlive ? 1 : 0,
      isRoot: data.isRoot ? 1 : 0,
    })
    .returning()
    .get()
  return toMember(result)
}

export function update(id: number, data: Partial<Omit<Member, 'id'>>): Member | null {
  const { attended2023, isAlive, isRoot, photoPath, ...rest } = data
  const row = db
    .update(members)
    .set({
      ...rest,
      ...(photoPath !== undefined ? { photoPath: normalizePhotoPath(photoPath) } : {}),
      ...(attended2023 !== undefined ? { attended2023: attended2023 ? 1 : 0 } : {}),
      ...(isAlive !== undefined ? { isAlive: isAlive ? 1 : 0 } : {}),
      ...(isRoot !== undefined ? { isRoot: isRoot ? 1 : 0 } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(members.id, id))
    .returning()
    .get()
  return row ? toMember(row) : null
}

export function remove(id: number): boolean {
  sqlite.prepare(`DELETE FROM email_logs WHERE member_id = ?`).run(id)
  sqlite.prepare(`DELETE FROM media WHERE member_id = ?`).run(id)
  sqlite.prepare(`DELETE FROM relationships WHERE from_member_id = ? OR to_member_id = ?`).run(id, id)
  // Two-parent families: demote to single-parent (keep the surviving parent)
  sqlite.prepare(`UPDATE nuclear_families SET parent1_id = parent2_id, parent2_id = NULL WHERE parent1_id = ? AND parent2_id IS NOT NULL`).run(id)
  sqlite.prepare(`UPDATE nuclear_families SET parent2_id = NULL WHERE parent2_id = ?`).run(id)
  // Single-parent families where the sole parent is being deleted: remove entirely
  sqlite.prepare(`DELETE FROM nuclear_families WHERE parent1_id = ? AND parent2_id IS NULL`).run(id)
  const result = db.delete(members).where(eq(members.id, id)).run()
  return result.changes > 0
}
