import { Command } from 'commander'
import chalk from 'chalk'
import * as branchesRepo from '../../core/branches.repository'
import * as membersRepo from '../../core/members.repository'
import { branchesTable, membersTable } from '../utils/table'

export function registerBranchCommand(program: Command): void {
  const branchCmd = program.command('branch').description('Manage family branches')

  branchCmd
    .command('list')
    .description('List all branches')
    .action(() => {
      const all = branchesRepo.findAll()
      console.log(branchesTable(all))
      console.log(chalk.dim(`${all.length} branches`))
    })

  branchCmd
    .command('show <name>')
    .description('Show all members in a branch (partial name match)')
    .action((name) => {
      const branch = branchesRepo.findByName(name)
      if (!branch) {
        console.error(chalk.red(`Branch matching "${name}" not found`))
        process.exit(1)
      }
      console.log(chalk.bold(`\n${branch.name}`))
      if (branch.description) console.log(branch.description)

      const branchMembers = branchesRepo.findMembersInBranch(branch.id)

      // Print as indented tree grouped by generation
      const byGen = new Map<number, typeof branchMembers>()
      for (const m of branchMembers) {
        const gen = m.generation ?? 0
        if (!byGen.has(gen)) byGen.set(gen, [])
        byGen.get(gen)!.push(m)
      }

      const gens = [...byGen.keys()].sort()
      for (const gen of gens) {
        const indent = '  '.repeat(gen - 2)
        console.log(`\n${indent}${chalk.cyan(`Generation ${gen}`)}`)
        for (const m of byGen.get(gen)!) {
          console.log(`${indent}  ${m.id.toString().padEnd(4)} ${m.firstName} ${m.lastName ?? ''} ${chalk.dim(m.city ?? '')}`)
        }
      }
    })
}
