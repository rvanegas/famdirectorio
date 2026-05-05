import { db } from '../db/client'
import { members, relationships } from '../db/schema'
import type { Member } from './types'

function toMember(row: typeof members.$inferSelect): Member {
  return {
    ...row,
    attended2023: row.attended2023 === 1,
    isAlive: row.isAlive === 1,
    earlyDeath: row.earlyDeath == null ? null : row.earlyDeath === 1,
    isRoot: row.isRoot === 1,
  }
}

export interface TreeVerifyResult {
  orphans: Member[]
  inLawsWithSeniority: Member[]
}

export function verifyTree(): TreeVerifyResult {
  const allMembers = db.select().from(members).all()
  const allRels = db.select().from(relationships).all()

  const rootSet = new Set(allMembers.filter(m => m.isRoot === 1).map(m => m.id))

  // Build descendant set via BFS from roots through child relationships
  const parentToChildren = new Map<number, number[]>()
  const spouseEdges: Array<[number, number]> = []
  for (const rel of allRels) {
    if (rel.type === 'child') {
      if (!parentToChildren.has(rel.fromMemberId)) parentToChildren.set(rel.fromMemberId, [])
      parentToChildren.get(rel.fromMemberId)!.push(rel.toMemberId)
    } else {
      spouseEdges.push([rel.fromMemberId, rel.toMemberId])
    }
  }

  const descendants = new Set<number>(rootSet)
  const queue = [...rootSet]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const childId of parentToChildren.get(id) ?? []) {
      if (!descendants.has(childId)) {
        descendants.add(childId)
        queue.push(childId)
      }
    }
  }

  // Spouses of any descendant are also valid
  const valid = new Set<number>(descendants)
  for (const [a, b] of spouseEdges) {
    if (descendants.has(a)) valid.add(b)
    if (descendants.has(b)) valid.add(a)
  }

  const orphans = allMembers.filter(m => !valid.has(m.id)).map(toMember)

  // In-laws: spouses of descendants who are not themselves descendants
  const inLawsWithSeniority = allMembers
    .filter(m => valid.has(m.id) && !descendants.has(m.id) && m.seniority !== null)
    .map(toMember)

  return { orphans, inLawsWithSeniority }
}
