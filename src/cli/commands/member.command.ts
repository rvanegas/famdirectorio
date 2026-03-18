import { Command } from 'commander'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import * as membersRepo from '../../core/members.repository'
import { membersTable, memberDetail } from '../utils/table'
import { promptMember } from '../utils/prompts'

export function registerMemberCommand(program: Command): void {
  const memberCmd = program.command('member').description('Manage family members')

  memberCmd
    .command('list')
    .description('List members')
    .option('-g, --generation <n>', 'Filter by generation (derived from relationships)')
    .option('-c, --city <name>', 'Filter by city (partial match)')
    .action((opts) => {
      let result
      if (opts.generation) {
        result = membersRepo.findByGeneration(parseInt(opts.generation, 10))
      } else if (opts.city) {
        result = membersRepo.findByCity(opts.city)
      } else {
        result = membersRepo.findAll()
      }
      console.log(membersTable(result))
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
