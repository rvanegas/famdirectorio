import { Command } from 'commander'
import chalk from 'chalk'
import * as relsRepo from '../../core/relationships.repository'
import * as membersRepo from '../../core/members.repository'
import type { Relationship } from '../../core/types'
import { relationships as relationshipsSchema } from '../../db/schema'
import { sqlite } from '../../db/client'

function syncNuclearFamilyAfterRelationship(fromId: number, toId: number, type: Relationship['type']): void {
  if (type === 'spouse') {
    // If one member already has a single-parent nuclear family, update it to a couple
    const existing = sqlite
      .prepare(`SELECT id, parent1_id FROM nuclear_families WHERE parent2_id IS NULL AND parent1_id IN (?, ?)`)
      .get(fromId, toId) as { id: number; parent1_id: number } | undefined
    if (existing) {
      const spouseId = existing.parent1_id === fromId ? toId : fromId
      const p1 = Math.min(existing.parent1_id, spouseId)
      const p2 = Math.max(existing.parent1_id, spouseId)
      sqlite.prepare(`UPDATE nuclear_families SET parent1_id=?, parent2_id=? WHERE id=?`).run(p1, p2, existing.id)
      console.log(chalk.green(`Updated nuclear family ${existing.id}: parents ${p1} & ${p2}`))
    } else {
      const p1 = Math.min(fromId, toId)
      const p2 = Math.max(fromId, toId)
      const alreadyExists = sqlite
        .prepare(`SELECT id FROM nuclear_families WHERE parent1_id=? AND parent2_id=?`)
        .get(p1, p2)
      if (!alreadyExists) {
        sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, ?)`).run(p1, p2)
        console.log(chalk.green(`Created nuclear family: parents ${p1} & ${p2}`))
      }
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
    .action((fromId, toId, type) => {
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
