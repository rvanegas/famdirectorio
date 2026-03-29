import { Command } from 'commander'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import * as relsRepo from '../../core/relationships.repository'
import * as membersRepo from '../../core/members.repository'
import type { Relationship } from '../../core/types'
import { relationships as relationshipsSchema } from '../../db/schema'
import { sqlite } from '../../db/client'

function syncNuclearFamilyAfterRelationship(fromId: number, toId: number, type: Relationship['type']): void {
  if (type === 'spouse') {
    const p1 = Math.min(fromId, toId)
    const p2 = Math.max(fromId, toId)

    // Skip if the two-parent family already exists
    const alreadyExists = sqlite
      .prepare(`SELECT id FROM nuclear_families WHERE parent1_id=? AND parent2_id=?`)
      .get(p1, p2)
    if (alreadyExists) return

    // Collect all single-parent families for either member
    const singles = sqlite
      .prepare(`SELECT id, parent1_id FROM nuclear_families WHERE parent2_id IS NULL AND parent1_id IN (?, ?)`)
      .all(fromId, toId) as { id: number; parent1_id: number }[]

    if (singles.length > 0) {
      // Upgrade the first one, delete any extras
      const [keep, ...extras] = singles
      sqlite.prepare(`UPDATE nuclear_families SET parent1_id=?, parent2_id=? WHERE id=?`).run(p1, p2, keep.id)
      console.log(chalk.green(`Updated nuclear family ${keep.id}: parents ${p1} & ${p2}`))
      for (const extra of extras) {
        sqlite.prepare(`DELETE FROM nuclear_families WHERE id=?`).run(extra.id)
        console.log(chalk.green(`Removed duplicate single-parent nuclear family ${extra.id}`))
      }
    } else {
      sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, ?)`).run(p1, p2)
      console.log(chalk.green(`Created nuclear family: parents ${p1} & ${p2}`))
    }
  } else if (type === 'child') {
    const parentId = fromId
    const exists = sqlite
      .prepare(`SELECT id FROM nuclear_families WHERE parent1_id=? OR parent2_id=?`)
      .get(parentId, parentId)
    if (!exists) {
      sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, NULL)`).run(parentId)
      console.log(chalk.green(`Created nuclear family: single parent ${parentId}`))
    }
  }
}

async function crossLinkChildren(aId: number, bId: number): Promise<void> {
  const aName = (() => { const m = membersRepo.findById(aId); return m ? `${m.firstName} ${m.lastName ?? ''}`.trim() : `ID ${aId}` })()
  const bName = (() => { const m = membersRepo.findById(bId); return m ? `${m.firstName} ${m.lastName ?? ''}`.trim() : `ID ${bId}` })()

  for (const childRel of relsRepo.findChildren(aId)) {
    const childId = childRel.toMemberId
    if (relsRepo.findByPair(bId, childId, 'child').length === 0) {
      const child = membersRepo.findById(childId)
      const childName = child ? `${child.firstName} ${child.lastName ?? ''}`.trim() : `ID ${childId}`
      const alsoAdd = await confirm({ message: `Is ${childName} (ID ${childId}) also a child of ${bName}?`, default: true })
      if (alsoAdd) {
        const r = relsRepo.create(bId, childId, 'child')
        console.log(chalk.green(`Created relationship ID ${r.id}: ${bId} → child → ${childId}`))
        syncNuclearFamilyAfterRelationship(bId, childId, 'child')
      }
    }
  }

  for (const childRel of relsRepo.findChildren(bId)) {
    const childId = childRel.toMemberId
    if (relsRepo.findByPair(aId, childId, 'child').length === 0) {
      const child = membersRepo.findById(childId)
      const childName = child ? `${child.firstName} ${child.lastName ?? ''}`.trim() : `ID ${childId}`
      const alsoAdd = await confirm({ message: `Is ${childName} (ID ${childId}) also a child of ${aName}?`, default: true })
      if (alsoAdd) {
        const r = relsRepo.create(aId, childId, 'child')
        console.log(chalk.green(`Created relationship ID ${r.id}: ${aId} → child → ${childId}`))
        syncNuclearFamilyAfterRelationship(aId, childId, 'child')
      }
    }
  }
}

export function registerRelationshipCommand(program: Command): void {
  const relCmd = program.command('relationship').description('Manage family relationships')

  relCmd
    .command('list <memberId>')
    .description('List all relationships for a member')
    .action((memberId) => {
      const id = parseInt(memberId, 10)
      const member = membersRepo.findById(id)
      if (!member) {
        console.error(chalk.red(`Member ${memberId} not found`))
        process.exit(1)
      }
      const rels = relsRepo.findByMember(id)
      const siblingIds = relsRepo.findSiblings(id)
      if (rels.length === 0 && siblingIds.length === 0) {
        console.log('No relationships recorded.')
        return
      }
      for (const rel of rels) {
        const isFrom = rel.fromMemberId === member.id
        const otherId = isFrom ? rel.toMemberId : rel.fromMemberId
        const other = membersRepo.findById(otherId)
        const name = other ? `${other.firstName} ${other.lastName ?? ''}` : `ID ${otherId}`
        const phrase =
          rel.type === 'child'
            ? isFrom ? 'has child' : 'is child of'
            : 'is spouse of'
        console.log(`  ${phrase.padEnd(13)}  ${name} (ID ${otherId})`)
      }
      for (const sibId of siblingIds) {
        const sib = membersRepo.findById(sibId)
        const name = sib ? `${sib.firstName} ${sib.lastName ?? ''}` : `ID ${sibId}`
        console.log(`  is sibling of  ${name} (ID ${sibId})`)
      }
    })

  relCmd
    .command('add <fromId> <toId> <type>')
    .description(
      'Add a relationship between two members.\n' +
      '  child:  fromId is the parent, toId is the child\n' +
      '  spouse: symmetric (order does not matter)\n' +
      '  Types: child|spouse  (siblings are inferred from shared parents)',
    )
    .action(async (fromId, toId, type) => {
      const validTypes = relationshipsSchema.type.enumValues
      if (!validTypes.includes(type as Relationship['type'])) {
        console.error(chalk.red(`Invalid type "${type}". Must be: ${validTypes.join(', ')}`))
        process.exit(1)
      }
      const fromNum = parseInt(fromId, 10)
      const toNum = parseInt(toId, 10)
      const relType = type as Relationship['type']
      const rel = relsRepo.create(fromNum, toNum, relType)
      console.log(chalk.green(`Created relationship ID ${rel.id}: ${fromId} → ${type} → ${toId}`))
      syncNuclearFamilyAfterRelationship(fromNum, toNum, relType)

      if (relType === 'child') {
        // If new parent already has a spouse, offer to also link the child to that spouse
        const parentRels = relsRepo.findByMember(fromNum)
        const spouseRel = parentRels.find((r) => r.type === 'spouse')
        if (spouseRel) {
          const spouseId = spouseRel.fromMemberId === fromNum ? spouseRel.toMemberId : spouseRel.fromMemberId
          const spouse = membersRepo.findById(spouseId)
          const spouseName = spouse ? `${spouse.firstName} ${spouse.lastName ?? ''}`.trim() : `ID ${spouseId}`
          const alsoAdd = await confirm({ message: `Also add child relationship from spouse ${spouseName} (ID ${spouseId})?`, default: true })
          if (alsoAdd) {
            const spouseRel2 = relsRepo.create(spouseId, toNum, 'child')
            console.log(chalk.green(`Created relationship ID ${spouseRel2.id}: ${spouseId} → child → ${toId}`))
            syncNuclearFamilyAfterRelationship(spouseId, toNum, 'child')
          }
        }

        // If the child already has other parents, offer to mark them as spouses of the new parent
        const existingParentRels = relsRepo.findByMember(toNum).filter(
          (r) => r.type === 'child' && r.toMemberId === toNum && r.fromMemberId !== fromNum,
        )
        for (const existingParentRel of existingParentRels) {
          const otherParentId = existingParentRel.fromMemberId
          if (relsRepo.findByPair(fromNum, otherParentId, 'spouse').length > 0) continue
          const otherParent = membersRepo.findById(otherParentId)
          const otherParentName = otherParent ? `${otherParent.firstName} ${otherParent.lastName ?? ''}`.trim() : `ID ${otherParentId}`
          const newParent = membersRepo.findById(fromNum)
          const newParentName = newParent ? `${newParent.firstName} ${newParent.lastName ?? ''}`.trim() : `ID ${fromNum}`
          const areSpouses = await confirm({ message: `${newParentName} (ID ${fromNum}) and ${otherParentName} (ID ${otherParentId}) are both parents of this child — are they spouses?`, default: true })
          if (areSpouses) {
            const sr = relsRepo.create(fromNum, otherParentId, 'spouse')
            console.log(chalk.green(`Created relationship ID ${sr.id}: ${fromNum} ↔ spouse ↔ ${otherParentId}`))
            syncNuclearFamilyAfterRelationship(fromNum, otherParentId, 'spouse')
            await crossLinkChildren(fromNum, otherParentId)
          }
        }
      }

      if (relType === 'spouse') {
        await crossLinkChildren(fromNum, toNum)
      }

      membersRepo.syncGenerations()
    })

  relCmd
    .command('delete <memberAId> <memberBId> [type]')
    .description('Delete a relationship between two members (type optional if only one exists)')
    .action((memberAId, memberBId, type) => {
      const a = parseInt(memberAId, 10)
      const b = parseInt(memberBId, 10)
      if (type) {
        const validTypes = relationshipsSchema.type.enumValues
        if (!validTypes.includes(type as Relationship['type'])) {
          console.error(chalk.red(`Invalid type "${type}". Must be: ${validTypes.join(', ')}`))
          process.exit(1)
        }
      }
      const found = relsRepo.findByPair(a, b, type as Relationship['type'] | undefined)
      if (found.length === 0) {
        console.error(chalk.red(`No relationship found between ${memberAId} and ${memberBId}${type ? ` of type "${type}"` : ''}`))
        process.exit(1)
      }
      if (found.length > 1 && !type) {
        console.error(chalk.red(`Multiple relationships found between ${memberAId} and ${memberBId}. Specify type: ${found.map((r) => r.type).join(', ')}`))
        process.exit(1)
      }
      for (const rel of found) {
        relsRepo.remove(rel.id)
      }
      console.log(chalk.green(`Deleted ${found.length} relationship(s) between ${memberAId} and ${memberBId}`))
      membersRepo.syncGenerations()
    })
}
