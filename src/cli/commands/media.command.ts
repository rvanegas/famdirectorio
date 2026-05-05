import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import * as mediaRepo from '../../core/media.repository'
import * as membersRepo from '../../core/members.repository'
import * as nuclearFamiliesRepo from '../../core/nuclearFamilies.repository'
import { config } from '../../config'

export function mediaFileName(firstName: string, lastName: string | null, ext: string, isFamily: boolean, id: number): string {
  const name = `${firstName}${lastName ? ' ' + lastName : ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return `${isFamily ? 'family of ' : ''}${name} - ${id}${ext}`
}

export function registerMediaCommand(program: Command): void {
  const mediaCmd = program.command('media').description('Manage media (photos, etc.)')

  mediaCmd
    .command('list [ownerId]')
    .description('List media for a member or family; use --family for family, -a/--all for everything')
    .option('-a, --all', 'List all media across all members and families')
    .option('-f, --family', 'Treat ownerId as a nuclear family ID')
    .action((ownerId, opts) => {
      let assets
      if (opts.all) {
        assets = mediaRepo.findAll()
      } else if (ownerId && opts.family) {
        const id = parseInt(ownerId, 10)
        const family = nuclearFamiliesRepo.findById(id)
        if (!family) {
          console.error(chalk.red(`Nuclear family ${ownerId} not found`))
          process.exit(1)
        }
        assets = mediaRepo.findByFamily(id)
      } else if (ownerId) {
        const member = membersRepo.findById(parseInt(ownerId, 10))
        if (!member) {
          console.error(chalk.red(`Member ${ownerId} not found`))
          process.exit(1)
        }
        assets = mediaRepo.findByMember(parseInt(ownerId, 10))
      } else {
        console.error(chalk.red('Provide an ownerId (member or --family), or use --all'))
        process.exit(1)
      }
      if (assets.length === 0) {
        console.log('No media found.')
        return
      }
      for (const a of assets) {
        const primary = a.isPrimary ? chalk.green(' [PRIMARY]') : ''
        let ownerLabel = ''
        if (opts.all) {
          ownerLabel = a.memberId != null
            ? chalk.dim(`  member ${a.memberId}`)
            : chalk.dim(`  family ${a.familyId}`)
        }
        console.log(`  ID ${a.id}${primary}${ownerLabel}  ${a.mediaType ?? 'photo'}  ${a.filePath}`)
        if (a.caption) console.log(`        "${a.caption}"`)
      }
    })

  mediaCmd
    .command('add <ownerId> <filePath>')
    .description('Attach a media file to a member (default) or nuclear family (--family)')
    .option('-c, --caption <text>', 'Caption for this media')
    .option('-f, --family', 'Treat ownerId as a nuclear family ID')
    .action((ownerId, filePath, opts) => {
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`))
        process.exit(1)
      }

      const id = parseInt(ownerId, 10)

      const famDir = config.dir
      const ext = path.extname(filePath)

      if (opts.family) {
        const family = nuclearFamiliesRepo.findById(id)
        if (!family) {
          console.error(chalk.red(`Nuclear family ${ownerId} not found`))
          process.exit(1)
        }
        const parent1 = membersRepo.findById(family.parent1Id)!
        const mediaDir = path.join(famDir, 'media', `family-${ownerId}`)
        fs.mkdirSync(mediaDir, { recursive: true })
        const tmpDest = path.join(mediaDir, `_tmp_${Date.now()}${ext}`)
        fs.copyFileSync(filePath, tmpDest)
        const asset = mediaRepo.create(path.relative(famDir, tmpDest), { familyId: id, caption: opts.caption, isPrimary: true, mediaType: 'photo' })
        const finalDest = path.join(mediaDir, mediaFileName(parent1.firstName, parent1.lastName, ext, true, asset.id))
        fs.renameSync(tmpDest, finalDest)
        const relPath = path.relative(famDir, finalDest)
        mediaRepo.updatePath(asset.id, relPath)
        console.log(chalk.green(`Attached media ID ${asset.id} to family ${ownerId}`))
      } else {
        const member = membersRepo.findById(id)
        if (!member) {
          console.error(chalk.red(`Member ${ownerId} not found`))
          process.exit(1)
        }
        const mediaDir = path.join(famDir, 'media', ownerId)
        fs.mkdirSync(mediaDir, { recursive: true })
        const tmpDest = path.join(mediaDir, `_tmp_${Date.now()}${ext}`)
        fs.copyFileSync(filePath, tmpDest)
        const asset = mediaRepo.create(path.relative(famDir, tmpDest), { memberId: id, caption: opts.caption, isPrimary: true, mediaType: 'photo' })
        const finalDest = path.join(mediaDir, mediaFileName(member.firstName, member.lastName, ext, false, asset.id))
        fs.renameSync(tmpDest, finalDest)
        const relPath = path.relative(famDir, finalDest)
        mediaRepo.updatePath(asset.id, relPath)
        membersRepo.update(id, { photoPath: relPath })
        console.log(chalk.green(`Attached media ID ${asset.id} to member ${ownerId}`))
      }
    })

  mediaCmd
    .command('set-primary <mediaId>')
    .description('Set a media item as the primary photo')
    .action((mediaId) => {
      const asset = mediaRepo.findById(parseInt(mediaId, 10))
      if (!asset) {
        console.error(chalk.red(`Media ${mediaId} not found`))
        process.exit(1)
      }
      mediaRepo.setPrimary(parseInt(mediaId, 10))
      if (asset.memberId != null) {
        membersRepo.update(asset.memberId, { photoPath: asset.filePath })
      }
      console.log(chalk.green(`Set media ${mediaId} as primary`))
    })

  mediaCmd
    .command('delete <mediaId>')
    .description('Delete a media record and its file from disk')
    .action((mediaId) => {
      const id = parseInt(mediaId, 10)
      const asset = mediaRepo.findById(id)
      if (!asset) {
        console.error(chalk.red(`Media ${mediaId} not found`))
        process.exit(1)
      }

      const famDir = config.dir
      const absPath = path.join(famDir, asset.filePath)
      mediaRepo.remove(id)

      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath)
      }

      if (asset.isPrimary && asset.memberId != null) {
        const remaining = mediaRepo.findByMember(asset.memberId).find((a) => a.isPrimary)
        membersRepo.update(asset.memberId, { photoPath: remaining?.filePath ?? null })
      }

      console.log(chalk.green(`Deleted media ${mediaId}`))
    })
}
