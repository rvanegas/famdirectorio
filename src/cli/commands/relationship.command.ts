import { Command } from 'commander'
import chalk from 'chalk'
import * as relsRepo from '../../core/relationships.repository'
import * as membersRepo from '../../core/members.repository'
import type { Relationship } from '../../core/types'

export function registerRelationshipCommand(program: Command): void {
  const relCmd = program.command('relationship').description('Manage family relationships')

  relCmd
    .command('list <memberId>')
    .description('List all relationships for a member')
    .action((memberId) => {
      const member = membersRepo.findById(parseInt(memberId, 10))
      if (!member) {
        console.error(chalk.red(`Member ${memberId} not found`))
        process.exit(1)
      }
      const rels = relsRepo.findByMember(parseInt(memberId, 10))
      if (rels.length === 0) {
        console.log('No relationships recorded.')
        return
      }
      for (const rel of rels) {
        const other = membersRepo.findById(
          rel.fromMemberId === member.id ? rel.toMemberId : rel.fromMemberId,
        )
        const direction = rel.fromMemberId === member.id ? '→' : '←'
        const name = other ? `${other.firstName} ${other.lastName ?? ''}` : `ID ${rel.toMemberId}`
        console.log(`  ${direction} ${rel.type.padEnd(8)} ${name} (ID ${other?.id ?? '?'})`)
      }
    })

  relCmd
    .command('add <fromId> <toId> <type>')
    .description('Add a relationship (type: parent|child|spouse|sibling)')
    .action((fromId, toId, type) => {
      const validTypes: Relationship['type'][] = ['parent', 'child', 'spouse', 'sibling']
      if (!validTypes.includes(type as Relationship['type'])) {
        console.error(chalk.red(`Invalid type "${type}". Must be: ${validTypes.join(', ')}`))
        process.exit(1)
      }
      const rel = relsRepo.create(parseInt(fromId, 10), parseInt(toId, 10), type as Relationship['type'])
      console.log(chalk.green(`Created relationship ID ${rel.id}: ${fromId} → ${type} → ${toId}`))
    })
}
