import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import * as mediaRepo from '../../core/media.repository'
import * as membersRepo from '../../core/members.repository'

export function registerMediaCommand(program: Command): void {
  const mediaCmd = program.command('media').description('Manage member media (photos, etc.)')

  mediaCmd
    .command('list [memberId]')
    .description('List media for a member, or all media with -a/--all')
    .option('-a, --all', 'List all media across all members')
    .action((memberId, opts) => {
      let assets
      if (opts.all) {
        assets = mediaRepo.findAll()
      } else if (memberId) {
        const member = membersRepo.findById(parseInt(memberId, 10))
        if (!member) {
          console.error(chalk.red(`Member ${memberId} not found`))
          process.exit(1)
        }
        assets = mediaRepo.findByMember(parseInt(memberId, 10))
      } else {
        console.error(chalk.red('Provide a memberId or use --all'))
        process.exit(1)
      }
      if (assets.length === 0) {
        console.log('No media found.')
        return
      }
      for (const a of assets) {
        const primary = a.isPrimary ? chalk.green(' [PRIMARY]') : ''
        const memberLabel = opts.all ? chalk.dim(`  member ${a.memberId}`) : ''
        console.log(`  ID ${a.id}${primary}${memberLabel}  ${a.mediaType ?? 'photo'}  ${a.filePath}`)
        if (a.caption) console.log(`        "${a.caption}"`)
      }
    })

  mediaCmd
    .command('add <memberId> <filePath>')
    .description('Attach a media file to a member')
    .option('-c, --caption <text>', 'Caption for this media')
    .option('-p, --primary', 'Set as the primary photo')
    .action((memberId, filePath, opts) => {
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`))
        process.exit(1)
      }
      const member = membersRepo.findById(parseInt(memberId, 10))
      if (!member) {
        console.error(chalk.red(`Member ${memberId} not found`))
        process.exit(1)
      }

      // Copy file to $FAM_DIR/media/{memberId}/
      const mediaDir = path.join(process.env.FAM_DIR!, 'media', memberId)
      fs.mkdirSync(mediaDir, { recursive: true })
      const dest = path.join(mediaDir, path.basename(filePath))
      fs.copyFileSync(filePath, dest)

      const relPath = path.relative(process.env.FAM_DIR!, dest)
      const asset = mediaRepo.create(parseInt(memberId, 10), relPath, {
        caption: opts.caption,
        isPrimary: opts.primary ?? false,
        mediaType: 'photo',
      })

      console.log(chalk.green(`Attached media ID ${asset.id} to member ${memberId}`))
      if (opts.primary) {
        membersRepo.update(parseInt(memberId, 10), { photoPath: relPath })
        console.log(chalk.green('Set as primary photo'))
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
      membersRepo.update(asset.memberId, { photoPath: asset.filePath })
      console.log(chalk.green(`Set media ${mediaId} as primary`))
    })
}
