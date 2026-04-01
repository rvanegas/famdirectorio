import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import { confirm, input } from '@inquirer/prompts'
import { sqlite } from '../../db/client'
import { verifyTree } from '../../core/tree'
import * as membersRepo from '../../core/members.repository'
import * as nuclearFamiliesRepo from '../../core/nuclearFamilies.repository'
import * as mediaRepo from '../../core/media.repository'
import { mediaFileName } from './media.command'

type FamilyKey = string  // "p1:p2" where p2 may be "null"

function spouseParentOrder(aId: number, bId: number): [number, number] {
  const aHasParent = sqlite.prepare(`SELECT id FROM relationships WHERE type='child' AND to_member_id=?`).get(aId) != null
  const bHasParent = sqlite.prepare(`SELECT id FROM relationships WHERE type='child' AND to_member_id=?`).get(bId) != null
  if (aHasParent && !bHasParent) return [aId, bId]
  if (bHasParent && !aHasParent) return [bId, aId]
  return [Math.min(aId, bId), Math.max(aId, bId)]
}

function derivedFamilies(): Set<FamilyKey> {
  const expected = new Set<FamilyKey>()

  const spouseRows = sqlite
    .prepare(`SELECT from_member_id AS a, to_member_id AS b FROM relationships WHERE type='spouse'`)
    .all() as { a: number; b: number }[]

  for (const { a, b } of spouseRows) {
    const [p1, p2] = spouseParentOrder(a, b)
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
      let missing = [...expected].filter(k => !stored.has(k))
      const extra = [...stored.keys()].filter(k => !expected.has(k))

      // Fix swapped parent order (descendant should be parent1)
      const swapped = extra.filter(k => {
        const [p1, p2] = k.split(':')
        return p2 !== 'null' && missing.includes(`${p2}:${p1}`)
      })
      if (swapped.length > 0) {
        for (const k of swapped) {
          const id = stored.get(k)!
          const [p1str, p2str] = k.split(':')
          sqlite.prepare(`UPDATE nuclear_families SET parent1_id=?, parent2_id=? WHERE id=?`).run(parseInt(p2str, 10), parseInt(p1str, 10), id)
        }
        console.log(chalk.green(`Fixed parent order for ${swapped.length} nuclear famil${swapped.length === 1 ? 'y' : 'ies'}`))
        const swappedMissing = swapped.map(k => { const [p1, p2] = k.split(':'); return `${p2}:${p1}` })
        missing = missing.filter(k => !swappedMissing.includes(k))
      }

      if (missing.length > 0) {
        for (const k of missing) {
          const [p1str, p2str] = k.split(':')
          const p1 = parseInt(p1str, 10)
          const p2 = p2str === 'null' ? null : parseInt(p2str, 10)
          sqlite.prepare(`INSERT INTO nuclear_families (parent1_id, parent2_id) VALUES (?, ?)`).run(p1, p2)
        }
        console.log(chalk.green(`Created ${missing.length} missing nuclear famil${missing.length === 1 ? 'y' : 'ies'}`))
      } else if (swapped.length === 0) {
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
      let missing = [...expected].filter(k => !stored.has(k))
      let extra = [...stored.keys()].filter(k => !expected.has(k))

      // Detect swapped parent order (descendant should be parent1, in-law parent2)
      const swapped = extra.filter(k => {
        const [p1, p2] = k.split(':')
        return p2 !== 'null' && missing.includes(`${p2}:${p1}`)
      })
      if (swapped.length > 0) {
        ok = false
        console.log(chalk.red(`✗ ${swapped.length} nuclear famil${swapped.length === 1 ? 'y has' : 'ies have'} parents in wrong order (descendant should be parent1):`))
        for (const k of swapped) {
          const id = stored.get(k)
          const [p1, p2] = k.split(':')
          console.log(`  id=${id}  stored: parent1=${p1} parent2=${p2}  →  correct: parent1=${p2} parent2=${p1}`)
        }
        const fix = await confirm({ message: `Swap parent order for ${swapped.length} famil${swapped.length === 1 ? 'y' : 'ies'}?`, default: true })
        if (fix) {
          for (const k of swapped) {
            const id = stored.get(k)!
            const [p1str, p2str] = k.split(':')
            sqlite.prepare(`UPDATE nuclear_families SET parent1_id=?, parent2_id=? WHERE id=?`).run(parseInt(p2str, 10), parseInt(p1str, 10), id)
          }
          console.log(chalk.green(`Fixed parent order for ${swapped.length} famil${swapped.length === 1 ? 'y' : 'ies'}`))
          const swappedMissing = swapped.map(k => { const [p1, p2] = k.split(':'); return `${p2}:${p1}` })
          missing = missing.filter(k => !swappedMissing.includes(k))
          extra = extra.filter(k => !swapped.includes(k))
          if (missing.length === 0 && extra.length === 0) ok = true
        }
      }

      if (missing.length === 0 && extra.length === 0 && swapped.length === 0) {
        console.log(chalk.green(`✓ nuclear_families consistent (${stored.size} families)`))
      } else if (missing.length > 0 || extra.length > 0) {
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
          const del = await confirm({ message: `Delete ${extra.length} extra nuclear famil${extra.length === 1 ? 'y' : 'ies'}?`, default: true })
          if (del) {
            for (const k of extra) {
              const id = stored.get(k)!
              sqlite.prepare(`DELETE FROM nuclear_families WHERE id=?`).run(id)
            }
            console.log(chalk.green(`Deleted ${extra.length} extra nuclear famil${extra.length === 1 ? 'y' : 'ies'}`))
            if (missing.length === 0) ok = true
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

      // --- Media filename convention check ---
      {
        const famDir = process.env.FAM_DIR!
        const allMedia = mediaRepo.findAll()
        const badMedia: { asset: typeof allMedia[0]; expectedBase: string; expectedFile: string }[] = []

        for (const asset of allMedia) {
          let firstName: string
          let lastName: string | null
          let isFamily: boolean

          if (asset.memberId != null) {
            const member = membersRepo.findById(asset.memberId)
            if (!member) continue
            firstName = member.firstName
            lastName = member.lastName
            isFamily = false
          } else if (asset.familyId != null) {
            const family = nuclearFamiliesRepo.findById(asset.familyId)
            if (!family) continue
            const parent1 = membersRepo.findById(family.parent1Id)
            if (!parent1) continue
            firstName = parent1.firstName
            lastName = parent1.lastName
            isFamily = true
          } else {
            continue
          }

          const ext = path.extname(asset.filePath)
          const expectedFile = mediaFileName(firstName, lastName, ext, isFamily, asset.id)
          const actualBase = path.basename(asset.filePath)
          if (actualBase !== expectedFile) {
            badMedia.push({ asset, expectedBase: expectedFile, expectedFile })
          }
        }

        if (badMedia.length === 0) {
          console.log(chalk.green('✓ All media files follow naming convention'))
        } else {
          ok = false
          console.log(chalk.red(`✗ ${badMedia.length} media file(s) with incorrect filename:`))
          for (const { asset, expectedFile } of badMedia) {
            const actual = path.basename(asset.filePath)
            console.log(`  ID ${asset.id}  "${actual}"  →  "${expectedFile}"`)
            const fix = await confirm({ message: `  Rename to "${expectedFile}"?`, default: true })
            if (fix) {
              const oldFull = path.join(famDir, asset.filePath)
              const newFull = path.join(path.dirname(oldFull), expectedFile)
              const newRel = path.relative(famDir, newFull)
              if (!fs.existsSync(oldFull)) {
                console.log(chalk.yellow(`  File not found on disk, updating DB path only`))
              } else {
                fs.renameSync(oldFull, newFull)
              }
              sqlite.prepare(`UPDATE media SET file_path=? WHERE id=?`).run(newRel, asset.id)
              if (asset.memberId != null) {
                const primary = sqlite.prepare(`SELECT is_primary FROM media WHERE id=?`).get(asset.id) as { is_primary: number } | undefined
                if (primary?.is_primary) {
                  sqlite.prepare(`UPDATE members SET photo_path=? WHERE id=?`).run(newRel, asset.memberId)
                }
              }
              console.log(chalk.green(`  Renamed media ID ${asset.id}`))
            }
          }
        }
      }

      // --- Instagram @ prefix check ---
      const badInstagram = sqlite
        .prepare(`SELECT id, first_name, last_name, instagram FROM members
                  WHERE instagram IS NOT NULL AND instagram != '' AND instagram NOT LIKE '@%'
                  ORDER BY id`)
        .all() as { id: number; first_name: string; last_name: string | null; instagram: string }[]

      if (badInstagram.length === 0) {
        console.log(chalk.green('✓ All instagram handles start with @'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${badInstagram.length} member(s) with instagram not starting with @:`))
        for (const m of badInstagram) {
          const name = `${m.first_name} ${m.last_name ?? ''}`.trim()
          const fixed = `@${m.instagram}`
          console.log(`  ID ${m.id}  ${name}  — "${m.instagram}"  (should be "${fixed}")`)
          const fix = await confirm({ message: `  Fix to "${fixed}"?`, default: true })
          if (fix) {
            const corrected = await input({
              message: '  Instagram handle:',
              default: fixed,
              validate: (v) => (!v || v.startsWith('@')) || 'Must start with @',
            })
            sqlite.prepare(`UPDATE members SET instagram=? WHERE id=?`).run(corrected || null, m.id)
            console.log(chalk.green(`  Updated ID ${m.id} instagram to "${corrected || 'null'}"` ))
          }
        }
      }

      if (!ok) process.exit(1)
    })
}
