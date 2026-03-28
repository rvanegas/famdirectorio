import { Command } from 'commander'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import * as membersRepo from '../../core/members.repository'
import * as relRepo from '../../core/relationships.repository'
import { membersTable, memberDetail, memberShow } from '../utils/table'
import { promptMember } from '../utils/prompts'

export function registerMemberCommand(program: Command): void {
  const memberCmd = program.command('member').description('Manage family members')

  memberCmd
    .command('list')
    .description('List members')
    .option('-g, --generation <n>', 'Filter by generation (derived from relationships)')
    .option('-c, --city <name>', 'Filter by city (partial match)')
    .option('-f, --fields <fields>', 'Extra fields to display (comma-separated: email,phone,instagram,occupation,seniority,attended2023,notes)')
    .action((opts) => {
      let result
      if (opts.generation) {
        result = membersRepo.findByGeneration(parseInt(opts.generation, 10))
      } else if (opts.city) {
        result = membersRepo.findByCity(opts.city)
      } else {
        result = membersRepo.findAll()
      }
      const extraFields = opts.fields ? opts.fields.split(',').map((f: string) => f.trim()) : []
      console.log(membersTable(result, extraFields))
      console.log(chalk.dim(`${result.length} members`))
    })

  memberCmd
    .command('get <id>')
    .description('Show full details for a member')
    .action((id) => {
      const member = membersRepo.findById(parseInt(id, 10))
      if (!member) {
        console.error(chalk.red(`Member ${id} not found`))
        process.exit(1)
      }
      console.log(memberDetail(member))
    })

  memberCmd
    .command('show <id>')
    .description('Show member details with generation and relationships')
    .action((id) => {
      const member = membersRepo.findById(parseInt(id, 10))
      if (!member) {
        console.error(chalk.red(`Member ${id} not found`))
        process.exit(1)
      }
      const generation = membersRepo.getGeneration(member.id)
      const rels = relRepo.findByMember(member.id)
      const parentIds = rels.filter(r => r.type === 'child' && r.toMemberId === member.id).map(r => r.fromMemberId)
      const spouseIds = rels.filter(r => r.type === 'spouse').map(r => r.fromMemberId === member.id ? r.toMemberId : r.fromMemberId)
      const childIds = rels.filter(r => r.type === 'child' && r.fromMemberId === member.id).map(r => r.toMemberId)
      const siblingIds = relRepo.findSiblings(member.id)
      const lookup = (ids: number[]) => ids.map(i => membersRepo.findById(i)).filter((m): m is NonNullable<typeof m> => m !== null)
      const bySeniority = (a: { seniority: number | null; id: number }, b: { seniority: number | null; id: number }) => {
        if (a.seniority === null && b.seniority === null) return a.id - b.id
        if (a.seniority === null) return 1
        if (b.seniority === null) return -1
        return a.seniority - b.seniority
      }
      console.log(memberShow(member, {
        generation,
        parents: lookup(parentIds),
        spouses: lookup(spouseIds),
        children: lookup(childIds).sort(bySeniority),
        siblings: lookup(siblingIds).sort(bySeniority),
      }))
    })

  memberCmd
    .command('add')
    .description('Add a new member (interactive)')
    .action(async () => {
      const data = await promptMember()
      const member = membersRepo.create({ ...data, photoPath: null })
      console.log(chalk.green(`Created member ID ${member.id}: ${member.firstName} ${member.lastName ?? ''}`))
    })

  memberCmd
    .command('edit <id>')
    .description('Edit a member (interactive)')
    .action(async (id) => {
      const existing = membersRepo.findById(parseInt(id, 10))
      if (!existing) {
        console.error(chalk.red(`Member ${id} not found`))
        process.exit(1)
      }
      const data = await promptMember(existing)
      const updated = membersRepo.update(parseInt(id, 10), data)
      if (updated) {
        console.log(chalk.green(`Updated member ${id}`))
      }
    })

  memberCmd
    .command('delete <id>')
    .description('Delete a member')
    .action(async (id) => {
      const existing = membersRepo.findById(parseInt(id, 10))
      if (!existing) {
        console.error(chalk.red(`Member ${id} not found`))
        process.exit(1)
      }
      const ok = await confirm({
        message: `Delete ${existing.firstName} ${existing.lastName ?? ''} (ID ${id})?`,
        default: false,
      })
      if (ok) {
        membersRepo.remove(parseInt(id, 10))
        console.log(chalk.green(`Deleted member ${id}`))
      } else {
        console.log('Cancelled')
      }
    })
}
