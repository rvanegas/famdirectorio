import { Command } from 'commander'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { sqlite } from '../../db/client'
import { verifyTree } from '../../core/tree'
import * as membersRepo from '../../core/members.repository'

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
    .command('sync')
    .description('Sync nuclear_families table and generation values from relationships')
    .action(async () => {
      // Sync nuclear families
      const expected = derivedFamilies()
      const stored = storedFamilies()
      const missing = [...expected].filter(k => !stored.has(k))
      if (missing.length > 0) {
        for (const k of missing) {
          const [p1str, p2str] = k.split(':')
          const p1 = parseInt(p1str, 10)
          const p2 = p2str === 'null' ? null : parseInt(p2str, 10)
          sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, ?)`).run(p1, p2)
        }
        console.log(chalk.green(`Created ${missing.length} missing nuclear famil${missing.length === 1 ? 'y' : 'ies'}`))
      } else {
        console.log(chalk.green('✓ nuclear_families already in sync'))
      }

      // Sync generations
      const count = membersRepo.syncGenerations()
      console.log(chalk.green(`✓ Synced generation for ${count} members`))
    })

  famCmd
    .command('verify')
    .description('Verify tree connectivity and nuclear_families consistency')
    .action(async () => {
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
          const create = await confirm({ message: `Create ${missing.length} missing nuclear famil${missing.length === 1 ? 'y' : 'ies'}?`, default: true })
          if (create) {
            for (const k of missing) {
              const [p1str, p2str] = k.split(':')
              const p1 = parseInt(p1str, 10)
              const p2 = p2str === 'null' ? null : parseInt(p2str, 10)
              sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, ?)`).run(p1, p2)
            }
            console.log(chalk.green(`Created ${missing.length} nuclear famil${missing.length === 1 ? 'y' : 'ies'}`))
            if (extra.length === 0) ok = true
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

      // --- Contact fields only for living members ---
      const deadWithContact = sqlite
        .prepare(`SELECT id, first_name, last_name, email, phone, occupation
                  FROM members
                  WHERE is_alive=0
                    AND (
                      (email    IS NOT NULL AND email    != '') OR
                      (phone    IS NOT NULL AND phone    != '') OR
                      (occupation IS NOT NULL AND occupation != '')
                    )
                  ORDER BY id`)
        .all() as { id: number; first_name: string; last_name: string | null; email: string | null; phone: string | null; occupation: string | null }[]

      if (deadWithContact.length === 0) {
        console.log(chalk.green('✓ No deceased members have contact/occupation data'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${deadWithContact.length} deceased member(s) with contact/occupation data:`))
        for (const m of deadWithContact) {
          const name = `${m.first_name} ${m.last_name ?? ''}`.trim()
          const fields = (['email', 'phone', 'occupation'] as const)
            .filter(f => m[f])
            .map(f => `${f}=${m[f]}`)
            .join('  ')
          console.log(`  ID ${m.id}  ${name}  — ${fields}`)
        }
      }

      // --- Generation consistency check ---
      const computed = membersRepo.computeAllGenerations()
      const storedGens = sqlite
        .prepare(`SELECT id, first_name, last_name, generation FROM members ORDER BY id`)
        .all() as { id: number; first_name: string; last_name: string | null; generation: number | null }[]
      const genMismatches = storedGens.filter(m => m.generation !== (computed.get(m.id) ?? null))
      if (genMismatches.length === 0) {
        console.log(chalk.green(`✓ generations stored and consistent (${storedGens.length} members)`))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${genMismatches.length} member(s) with missing or stale generation:`))
        for (const m of genMismatches) {
          const name = `${m.first_name} ${m.last_name ?? ''}`.trim()
          console.log(`  ID ${m.id}  ${name}  stored=${m.generation ?? 'null'}  computed=${computed.get(m.id)}`)
        }
      }

      if (!ok) process.exit(1)
    })
}
