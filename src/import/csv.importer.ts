import { db, sqlite } from '../db/client'
import { members, relationships, branches } from '../db/schema'
import { parseCsv } from './csv.parser'
import { mapRows } from './csv.mapper'
import { eq } from 'drizzle-orm'

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

    // 3. Upsert relationships (skip duplicates)
    for (const rel of relList) {
      const exists = db
        .select()
        .from(relationships)
        .where(eq(relationships.fromMemberId, rel.fromMemberId))
        .all()
        .find(
          (r) => r.toMemberId === rel.toMemberId && r.type === rel.type
        )
      if (!exists) {
        db.insert(relationships).values(rel).run()
      }
    }

    // 4. Resolve branchId for each member by walking up relationships
    const allBranches = db.select().from(branches).all()
    const branchByFounder = new Map(allBranches.map((b) => [b.founderMemberId!, b.id]))
    const allRels = db.select().from(relationships).all()

    // Build parent lookup: memberId → parentId
    const parentOf = new Map<number, number>()
    for (const rel of allRels) {
      if (rel.type === 'child') {
        // fromMemberId is parent, toMemberId is child
        parentOf.set(rel.toMemberId, rel.fromMemberId)
      }
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

  const memberCount = db.select().from(members).all().length
  const relCount = db.select().from(relationships).all().length
  const branchCount = db.select().from(branches).all().length

  console.log(`Import complete:`)
  console.log(`  Members:       ${memberCount}`)
  console.log(`  Relationships: ${relCount}`)
  console.log(`  Branches:      ${branchCount}`)
}
