import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import * as mediaRepo from '../../core/media.repository'
import * as membersRepo from '../../core/members.repository'

export function registerMediaCommand(program: Command): void {
  const mediaCmd = program.command('media').description('Manage member media (photos, etc.)')

  mediaCmd
    .command('list <memberId>')
    .description('List all media for a member')
    .action((memberId) => {
      const member = membersRepo.findById(parseInt(memberId, 10))
      if (!member) {
        console.error(chalk.red(`Member ${memberId} not found`))
        process.exit(1)
      }
      const assets = mediaRepo.findByMember(parseInt(memberId, 10))
      if (assets.length === 0) {
        console.log('No media attached.')
        return
      }
      for (const a of assets) {
        const primary = a.isPrimary ? chalk.green(' [PRIMARY]') : ''
        console.log(`  ID ${a.id}${primary}  ${a.mediaType ?? 'photo'}  ${a.filePath}`)
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

      // Copy file to data/media/{memberId}/
      const mediaDir = path.resolve(process.cwd(), `data/media/${memberId}`)
      fs.mkdirSync(mediaDir, { recursive: true })
      const dest = path.join(mediaDir, path.basename(filePath))
      fs.copyFileSync(filePath, dest)
      const relativePath = path.relative(process.cwd(), dest)

      const asset = mediaRepo.create(parseInt(memberId, 10), relativePath, {
        caption: opts.caption,
        isPrimary: opts.primary ?? false,
        mediaType: 'photo',
      })

      console.log(chalk.green(`Attached media ID ${asset.id} to member ${memberId}`))
      if (opts.primary) console.log(chalk.green('Set as primary photo'))
    })

  mediaCmd
    .command('set-primary <mediaId>')
    .description('Set a media item as the primary photo')
    .action((mediaId) => {
      const ok = mediaRepo.setPrimary(parseInt(mediaId, 10))
      if (ok) {
        console.log(chalk.green(`Set media ${mediaId} as primary`))
      } else {
        console.error(chalk.red(`Media ${mediaId} not found`))
        process.exit(1)
      }
    })
}
