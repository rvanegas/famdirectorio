import { db, sqlite } from '../db/client'
import { members, relationships, branches } from '../db/schema'
import type { NewRelationship } from '../db/schema'
import { parseCsv } from './csv.parser'
import { mapRows } from './csv.mapper'
import { resolveRelationships } from './relationship.resolver'
import { eq, sql } from 'drizzle-orm'

// Gen-2 member IDs in the Durán Mazuera CSV
// These are the 14 direct children of Luciano (ID 14) & Clara (ID 15)
const GEN2_IDS = new Set([16, 22, 32, 42, 53, 70, 85, 93, 99, 101, 105, 117, 118, 124])
const ROOT_IDS = new Set([14, 15]) // Luciano & Clara

export async function importCsv(filePath: string): Promise<void> {
  const rows = parseCsv(filePath)
  const mapped = mapRows(rows)

  // Deduplicate by ID (keep last occurrence)
  const memberMap = new Map<number, (typeof mapped)[0]['member']>()
  const relList: NonNullable<(typeof mapped)[0]['relationship']>[] = []

  for (const { member, relationship } of mapped) {
    memberMap.set(member.id!, member)
    if (relationship) relList.push(relationship)
  }

  let inferredCount = 0

  sqlite.transaction(() => {
    // 1. Upsert all members (without branchId first)
    for (const member of memberMap.values()) {
      const existing = db.select().from(members).where(eq(members.id, member.id!)).get()
      if (existing) {
        db.update(members)
          .set({ ...member, updatedAt: new Date().toISOString() })
          .where(eq(members.id, member.id!))
          .run()
      } else {
        db.insert(members).values(member).run()
      }
    }

    // 2. Seed branches from Gen-2 members
    const gen2Members = [...memberMap.values()].filter((m) => GEN2_IDS.has(m.id!))
    for (const gen2 of gen2Members) {
      const branchName = `Rama ${gen2.firstName} ${gen2.lastName ?? ''}`.trim()
      const existing = db.select().from(branches).where(eq(branches.founderMemberId, gen2.id!)).get()
      if (!existing) {
        db.insert(branches).values({
          name: branchName,
          founderMemberId: gen2.id!,
          description: null,
          colorHex: null,
        }).run()
      }
    }

    // 3. Upsert all relationships (Ref/Rel columns + inferred from text)
    //    Pre-load existing rels into a Set to avoid N+1 queries and to give
    //    the text resolver accurate dedup context (including prior imports).
    const relSet = new Set<string>()
    const existingChildToIds = new Set<number>()
    const existingSpouseIds = new Set<number>()

    function indexRel(r: { fromMemberId: number; toMemberId: number; type: string; notes?: string | null }) {
      relSet.add(`${r.fromMemberId}:${r.toMemberId}:${r.type}`)
      if (r.type === 'child') existingChildToIds.add(r.toMemberId)
      if (r.type === 'spouse') {
        existingSpouseIds.add(r.fromMemberId)
        existingSpouseIds.add(r.toMemberId)
      }
    }

    for (const r of db.select().from(relationships).all()) indexRel(r)

    function upsertRel(rel: NewRelationship) {
      const key = `${rel.fromMemberId}:${rel.toMemberId}:${rel.type}`
      if (!relSet.has(key)) {
        db.insert(relationships).values(rel).run()
        indexRel(rel)
      }
    }

    for (const rel of relList) upsertRel(rel)

    // 3b. Infer additional relationships from the free-text Relación column.
    //     existingChildToIds/existingSpouseIds now reflect the full DB state.
    const resolvableMembers = [...memberMap.values()].map((m) => ({
      id: m.id!,
      firstName: m.firstName,
      generation: m.generation ?? null,
      relationText: m.relationText ?? null,
    }))
    const { relationships: inferred, unresolved } = resolveRelationships(
      resolvableMembers,
      existingChildToIds,
      existingSpouseIds,
    )
    inferredCount = inferred.length
    for (const rel of inferred) upsertRel(rel)

    if (unresolved.length > 0) {
      console.warn(`  Unresolved (${unresolved.length}):`)
      for (const u of unresolved) {
        console.warn(`    [${u.memberId}] "${u.text}" → ${u.reason}`)
      }
    }

    // 4. Resolve branchId for each member by walking up relationships
    const allBranches = db.select().from(branches).all()
    const branchByFounder = new Map(allBranches.map((b) => [b.founderMemberId!, b.id]))

    // Build parent lookup: memberId → parentId
    const parentOf = new Map<number, number>()
    for (const r of db.select().from(relationships).all()) {
      if (r.type === 'child') parentOf.set(r.toMemberId, r.fromMemberId)
    }

    function resolveBranch(memberId: number, depth = 0): number | null {
      if (depth > 10) return null
      if (GEN2_IDS.has(memberId)) return branchByFounder.get(memberId) ?? null
      if (ROOT_IDS.has(memberId)) return null
      const parent = parentOf.get(memberId)
      if (!parent) return null
      return resolveBranch(parent, depth + 1)
    }

    for (const member of memberMap.values()) {
      const branchId = resolveBranch(member.id!)
      if (branchId !== null) {
        db.update(members)
          .set({ branchId })
          .where(eq(members.id, member.id!))
          .run()
      }
    }
  })()

  const memberCount = db.select({ n: sql<number>`count(*)` }).from(members).get()!.n
  const relCount = db.select({ n: sql<number>`count(*)` }).from(relationships).get()!.n
  const branchCount = db.select({ n: sql<number>`count(*)` }).from(branches).get()!.n

  console.log(`Import complete:`)
  console.log(`  Members:       ${memberCount}`)
  console.log(`  Relationships: ${relCount} (${inferredCount} inferred from text)`)
  console.log(`  Branches:      ${branchCount}`)
}
