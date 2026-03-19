import { Command } from 'commander'
import chalk from 'chalk'
import { sqlite } from '../../db/client'
import { verifyTree } from '../../core/tree'

type FamilyKey = string  // "p1:p2" where p2 may be "null"

function derivedFamilies(): Set<FamilyKey> {
  const expected = new Set<FamilyKey>()

  const spouseRows = sqlite
    .prepare(`SELECT MIN(from_member_id, to_member_id) AS p1, MAX(from_member_id, to_member_id) AS p2
              FROM relationships WHERE type='spouse'
              GROUP BY p1, p2`)
    .all() as { p1: number; p2: number }[]

  for (const { p1, p2 } of spouseRows) {
    expected.add(`${p1}:${p2}`)
  }

  const singleParentRows = sqlite
    .prepare(`SELECT DISTINCT from_member_id AS p FROM relationships WHERE type='child'
              AND from_member_id NOT IN (
                SELECT from_member_id FROM relationships WHERE type='spouse'
                UNION SELECT to_member_id FROM relationships WHERE type='spouse'
              )`)
    .all() as { p: number }[]

  for (const { p } of singleParentRows) {
    expected.add(`${p}:null`)
  }

  return expected
}

function storedFamilies(): Map<FamilyKey, number> {
  const rows = sqlite
    .prepare(`SELECT id, parent1_id, parent2_id FROM nuclear_families`)
    .all() as { id: number; parent1_id: number; parent2_id: number | null }[]

  const map = new Map<FamilyKey, number>()
  for (const { id, parent1_id, parent2_id } of rows) {
    map.set(`${parent1_id}:${parent2_id ?? 'null'}`, id)
  }
  return map
}

export function registerFamilyCommand(program: Command): void {
  const famCmd = program.command('family').description('Nuclear family management')

  famCmd
    .command('verify')
    .description('Verify tree connectivity and nuclear_families consistency')
    .action(() => {
      let ok = true

      // --- Tree connectivity check ---
      const { orphans } = verifyTree()
      if (orphans.length === 0) {
        console.log(chalk.green('✓ All members connected to root'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${orphans.length} member(s) not connected to root:`))
        for (const m of orphans) {
          console.log(`  ID ${m.id}  ${m.firstName} ${m.lastName ?? ''}`.trim())
        }
      }

      // --- Nuclear families consistency check ---
      const expected = derivedFamilies()
      const stored = storedFamilies()
      const missing = [...expected].filter(k => !stored.has(k))
      const extra = [...stored.keys()].filter(k => !expected.has(k))

      if (missing.length === 0 && extra.length === 0) {
        console.log(chalk.green(`✓ nuclear_families consistent (${stored.size} families)`))
      } else {
        ok = false
        if (missing.length > 0) {
          console.log(chalk.red(`✗ Missing from nuclear_families (${missing.length}):`))
          for (const k of missing) {
            const [p1, p2] = k.split(':')
            console.log(`  parent1=${p1} parent2=${p2}`)
          }
        }
        if (extra.length > 0) {
          console.log(chalk.yellow(`✗ Extra rows not derivable from relationships (${extra.length}):`))
          for (const k of extra) {
            const id = stored.get(k)
            const [p1, p2] = k.split(':')
            console.log(`  id=${id} parent1=${p1} parent2=${p2}`)
          }
        }
      }

      if (!ok) process.exit(1)
    })
}
