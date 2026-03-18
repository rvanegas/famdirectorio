import { Command } from 'commander'
import chalk from 'chalk'
import { verifyTree } from '../../core/tree'

export function registerTreeCommand(program: Command): void {
  const treeCmd = program.command('tree').description('Family tree utilities')

  treeCmd
    .command('verify')
    .description('Verify every member is a root, descendant of root, or spouse of a descendant')
    .action(() => {
      const { orphans } = verifyTree()
      if (orphans.length === 0) {
        console.log(chalk.green('✓ All members are connected to the root.'))
        return
      }
      console.log(chalk.red(`✗ ${orphans.length} member(s) not connected to the root:\n`))
      for (const m of orphans) {
        const name = `${m.firstName} ${m.lastName ?? ''}`.trim()
        console.log(`  ID ${m.id}  ${name}`)
      }
      process.exit(1)
    })
}
