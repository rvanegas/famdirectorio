import { Command } from 'commander'
import chalk from 'chalk'
import { input, confirm } from '@inquirer/prompts'
import * as orphansRepo from '../../core/orphans.repository'

function decodeSpanish(text: string): string {
  return text
    .replace(/a'/g, 'á').replace(/A'/g, 'Á')
    .replace(/e'/g, 'é').replace(/E'/g, 'É')
    .replace(/i'/g, 'í').replace(/I'/g, 'Í')
    .replace(/o'/g, 'ó').replace(/O'/g, 'Ó')
    .replace(/u'/g, 'ú').replace(/U'/g, 'Ú')
    .replace(/n~/g, 'ñ').replace(/N~/g, 'Ñ')
    .replace(/u"/g, 'ü').replace(/U"/g, 'Ü')
}

function spanishInput(message: string) {
  return input({ message, transformer: decodeSpanish }).then(decodeSpanish)
}

export function registerOrphansCommand(program: Command): void {
  const orphansCmd = program.command('orphans').description('Manage orphan records')

  orphansCmd
    .command('list')
    .description('List all orphans')
    .action(() => {
      const rows = orphansRepo.findAll()
      if (rows.length === 0) {
        console.log(chalk.dim('No orphans found'))
        return
      }
      const header = chalk.cyan(`${'ID'.padEnd(6)}${'First name'.padEnd(20)}${'Last name'.padEnd(20)}Birthday`)
      const lines = rows.map(o =>
        `${String(o.id).padEnd(6)}${(o.firstName).padEnd(20)}${(o.lastName ?? '-').padEnd(20)}${o.birthday ?? '-'}`
      )
      console.log([header, ...lines].join('\n'))
      console.log(chalk.dim(`${rows.length} orphans`))
    })

  orphansCmd
    .command('add')
    .description('Add a new orphan (interactive)')
    .action(async () => {
      const firstName = await spanishInput('First name:')
      const lastName  = await spanishInput('Last name (leave blank to skip):')
      const birthday  = await input({ message: 'Birthday YYYY-MM-DD (leave blank to skip):' })
      const orphan = orphansRepo.create({
        firstName,
        lastName:  lastName  || null,
        birthday:  birthday  || null,
      })
      console.log(chalk.green(`Created orphan ID ${orphan.id}: ${orphan.firstName} ${orphan.lastName ?? ''}`))
    })

  orphansCmd
    .command('delete <id>')
    .description('Delete an orphan by ID')
    .action(async (id) => {
      const all = orphansRepo.findAll()
      const orphan = all.find(o => o.id === parseInt(id, 10))
      if (!orphan) {
        console.error(chalk.red(`Orphan ${id} not found`))
        process.exit(1)
      }
      const ok = await confirm({
        message: `Delete ${orphan.firstName} ${orphan.lastName ?? ''} (ID ${id})?`,
        default: false,
      })
      if (ok) {
        orphansRepo.remove(parseInt(id, 10))
        console.log(chalk.green(`Deleted orphan ${id}`))
      } else {
        console.log('Cancelled')
      }
    })
}
