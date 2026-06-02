import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import { checkbox, confirm, editor, input } from '@inquirer/prompts'
import { sqlite } from '../../db/client'
import { verifyTree } from '../../core/tree'
import * as membersRepo from '../../core/members.repository'
import { membersTable } from '../utils/table'
import * as nuclearFamiliesRepo from '../../core/nuclearFamilies.repository'
import * as familyNotesRepo from '../../core/familyNotes.repository'
import * as mediaRepo from '../../core/media.repository'
import { mediaFileName } from './media.command'
import { config } from '../../config'

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
      const { orphans, inLawsWithSeniority } = verifyTree()
      if (orphans.length === 0) {
        console.log(chalk.green('✓ All members connected to root'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${orphans.length} member(s) not connected to root:`))
        for (const m of orphans) {
          console.log(`  ID ${m.id}  ${m.firstName} ${m.lastName ?? ''}`.trim())
        }
      }

      // --- In-law seniority check ---
      // In-laws are spouses of descendants; they have no birth order within the family tree
      if (inLawsWithSeniority.length === 0) {
        console.log(chalk.green('✓ No in-laws have seniority set'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${inLawsWithSeniority.length} in-law(s) with seniority set (in-laws have no birth order):`))
        for (const m of inLawsWithSeniority) {
          const name = `${m.firstName} ${m.lastName ?? ''}`.trim()
          console.log(`  ID ${m.id}  ${name}  — seniority=${m.seniority}`)
        }
      }

      // --- Multiple spouses check ---
      {
        const spouseCounts = sqlite
          .prepare(`SELECT m.id, m.first_name, m.last_name, COUNT(*) as cnt
                    FROM (
                      SELECT from_member_id AS mid FROM relationships WHERE type='spouse'
                      UNION ALL
                      SELECT to_member_id   AS mid FROM relationships WHERE type='spouse'
                    ) s
                    JOIN members m ON m.id = s.mid
                    GROUP BY s.mid
                    HAVING cnt > 1
                    ORDER BY m.id`)
          .all() as { id: number; first_name: string; last_name: string | null; cnt: number }[]
        if (spouseCounts.length === 0) {
          console.log(chalk.green('✓ No members with multiple spouses'))
        } else {
          ok = false
          console.log(chalk.red(`✗ ${spouseCounts.length} member(s) with multiple spouses:`))
          for (const m of spouseCounts) {
            const name = `${m.first_name} ${m.last_name ?? ''}`.trim()
            console.log(`  ID ${m.id}  ${name}  — ${m.cnt} spouses`)
          }
        }
      }

      // --- Duplicate relationships check ---
      {
        const dupPairs = sqlite
          .prepare(`SELECT MIN(from_member_id, to_member_id) AS a,
                           MAX(from_member_id, to_member_id) AS b,
                           COUNT(*) AS cnt
                    FROM relationships
                    GROUP BY MIN(from_member_id, to_member_id), MAX(from_member_id, to_member_id)
                    HAVING cnt > 1
                    ORDER BY a, b`)
          .all() as { a: number; b: number; cnt: number }[]

        if (dupPairs.length === 0) {
          console.log(chalk.green('✓ No duplicate relationships between any two members'))
        } else {
          ok = false
          console.log(chalk.red(`✗ ${dupPairs.length} pair(s) with multiple relationships:`))
          for (const { a, b, cnt } of dupPairs) {
            const ma = sqlite.prepare(`SELECT first_name, last_name FROM members WHERE id=?`).get(a) as { first_name: string; last_name: string | null } | undefined
            const mb = sqlite.prepare(`SELECT first_name, last_name FROM members WHERE id=?`).get(b) as { first_name: string; last_name: string | null } | undefined
            const nameA = ma ? `${ma.first_name} ${ma.last_name ?? ''}`.trim() : `ID ${a}`
            const nameB = mb ? `${mb.first_name} ${mb.last_name ?? ''}`.trim() : `ID ${b}`
            console.log(`  ${nameA} (${a}) ↔ ${nameB} (${b})  — ${cnt} relationships`)

            const rows = sqlite
              .prepare(`SELECT id, from_member_id, to_member_id, type, notes
                         FROM relationships
                         WHERE (from_member_id=? AND to_member_id=?) OR (from_member_id=? AND to_member_id=?)
                         ORDER BY id`)
              .all(a, b, b, a) as { id: number; from_member_id: number; to_member_id: number; type: string; notes: string | null }[]

            const choices = rows.map(r => {
              const mf = sqlite.prepare(`SELECT first_name, last_name FROM members WHERE id=?`).get(r.from_member_id) as { first_name: string; last_name: string | null } | undefined
              const mt = sqlite.prepare(`SELECT first_name, last_name FROM members WHERE id=?`).get(r.to_member_id) as { first_name: string; last_name: string | null } | undefined
              const fromName = mf ? `${mf.first_name} ${mf.last_name ?? ''}`.trim() : `ID ${r.from_member_id}`
              const toName   = mt ? `${mt.first_name} ${mt.last_name ?? ''}`.trim() : `ID ${r.to_member_id}`
              const label = `ID ${r.id}  ${r.type}  ${fromName} → ${toName}${r.notes ? `  (${r.notes})` : ''}`
              return { name: label, value: r.id }
            })

            const toDelete = await checkbox({
              message: `  Select relationship(s) to DELETE (keep the one(s) you want):`,
              choices,
            })

            for (const rid of toDelete) {
              sqlite.prepare(`DELETE FROM relationships WHERE id=?`).run(rid)
              console.log(chalk.green(`  Deleted relationship ID ${rid}`))
            }
          }
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
        .prepare(`SELECT id, first_name, last_name, email, phone, occupation, instagram, birthday
                  FROM members
                  WHERE is_alive=0
                    AND (
                      (email      IS NOT NULL AND email      != '') OR
                      (phone      IS NOT NULL AND phone      != '') OR
                      (occupation IS NOT NULL AND occupation != '') OR
                      (instagram  IS NOT NULL AND instagram  != '') OR
                      (birthday   IS NOT NULL AND birthday   != '')
                    )
                  ORDER BY id`)
        .all() as { id: number; first_name: string; last_name: string | null; email: string | null; phone: string | null; occupation: string | null; instagram: string | null; birthday: string | null }[]

      if (deadWithContact.length === 0) {
        console.log(chalk.green('✓ No deceased members have contact/occupation data'))
      } else {
        ok = false
        console.log(chalk.red(`✗ ${deadWithContact.length} deceased member(s) with contact/occupation data:`))
        for (const m of deadWithContact) {
          const name = `${m.first_name} ${m.last_name ?? ''}`.trim()
          const fields = (['email', 'phone', 'occupation', 'instagram', 'birthday'] as const)
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
          const computedGen = computed.get(m.id)
          console.log(`  ID ${m.id}  ${name}  stored=${m.generation ?? 'null'}  computed=${computedGen}`)
          const fix = await confirm({ message: `  Set generation for ID ${m.id} (${name}) to ${computedGen}?`, default: true })
          if (fix) {
            sqlite.prepare(`UPDATE members SET generation=? WHERE id=?`).run(computedGen ?? null, m.id)
            console.log(chalk.green(`  Updated ID ${m.id} generation to ${computedGen}`))
          }
        }
      }

      // --- Media filename convention check ---
      {
        const famDir = config.dir
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

  famCmd
    .command('unverified [date]')
    .description('List members not verified since <date> (YYYY-MM-DD, default: 2 years ago)')
    .option('-g, --generation <n>', 'Limit to generation N and earlier', parseInt)
    .action((date?: string, opts: { generation?: number } = {}) => {
      if (!date) {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 2)
        date = d.toISOString().slice(0, 10)
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
        console.error(chalk.red('Date must be YYYY-MM-DD'))
        process.exit(1)
      }
      const result = membersRepo.findUnverifiedSince(date, opts.generation)
      console.log(membersTable(result, ['generation', 'phone', 'email', 'requestedAt']))
      console.log(chalk.dim(`${result.length} member(s) not verified since ${date}`))
    })

  // --- family note subcommands ---
  const noteCmd = famCmd.command('note').description('Notes associated with nuclear families')

  noteCmd
    .command('list')
    .description('List family notes')
    .option('--family <id>', 'Filter by nuclear family ID', parseInt)
    .action((opts: { family?: number }) => {
      const notes = opts.family != null
        ? familyNotesRepo.findByFamily(opts.family)
        : familyNotesRepo.findAll()

      if (notes.length === 0) {
        console.log(chalk.gray('No notes found.'))
        return
      }

      for (const note of notes) {
        const family = nuclearFamiliesRepo.findById(note.familyId)
        let familyLabel = `family #${note.familyId}`
        if (family) {
          const p1 = membersRepo.findById(family.parent1Id)
          const p2 = family.parent2Id != null ? membersRepo.findById(family.parent2Id) : null
          const names = [p1, p2].filter(Boolean).map(m => `${m!.firstName} ${m!.lastName ?? ''}`.trim())
          familyLabel = names.join(' & ')
        }
        console.log(chalk.bold(`[${note.id}] ${familyLabel}`) + chalk.gray(` (${note.createdAt ?? ''})`))
        console.log(`  ${note.content}`)
      }
    })

  noteCmd
    .command('add <familyId>')
    .description('Add a note to a nuclear family')
    .option('--text <text>', 'Note content (skips editor prompt)')
    .action(async (familyId: string, opts: { text?: string }) => {
      const fid = parseInt(familyId, 10)
      const family = nuclearFamiliesRepo.findById(fid)
      if (!family) {
        console.error(chalk.red(`No nuclear family with ID ${fid}`))
        process.exit(1)
      }

      let content: string
      if (opts.text) {
        content = opts.text.trim()
      } else {
        content = await editor({ message: 'Note content:' })
        content = content.trim()
      }

      if (!content) {
        console.error(chalk.red('Note content cannot be empty.'))
        process.exit(1)
      }

      const note = familyNotesRepo.create(fid, content)
      console.log(chalk.green(`Created note ID ${note.id} for family #${fid}`))
    })

  noteCmd
    .command('delete <noteId>')
    .description('Delete a family note')
    .action(async (noteId: string) => {
      const nid = parseInt(noteId, 10)
      const notes = familyNotesRepo.findAll()
      const note = notes.find(n => n.id === nid)
      if (!note) {
        console.error(chalk.red(`No note with ID ${nid}`))
        process.exit(1)
      }

      console.log(`  ${note.content}`)
      const ok = await confirm({ message: `Delete note #${nid}?`, default: false })
      if (ok) {
        familyNotesRepo.remove(nid)
        console.log(chalk.green(`Deleted note #${nid}`))
      }
    })
}
