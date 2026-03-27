import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import * as membersRepo from '../../core/members.repository'
import {
  resolveTemplate,
  renderEmail,
  findLatestPdf,
  sendEmail,
} from '../../core/email.service'

export function registerEmailCommand(program: Command): void {
  const emailCmd = program.command('email').description('Send emails to family members')

  emailCmd
    .command('send <recipients-file>')
    .description('Send an email with the directory attached; recipients-file has one member ID per line')
    .requiredOption('-t, --template <name>', 'Template name (without extension)')
    .option('--dry-run', 'Print emails to stdout without sending')
    .action(async (recipientsFile: string, opts) => {
      const filePath = path.resolve(process.cwd(), recipientsFile)
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`Recipients file not found: ${filePath}`))
        process.exit(1)
      }

      const ids: number[] = fs
        .readFileSync(filePath, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const n = parseInt(l, 10)
          if (isNaN(n)) {
            console.error(chalk.red(`Invalid ID in recipients file: "${l}"`))
            process.exit(1)
          }
          return n
        })

      if (ids.length === 0) {
        console.log(chalk.yellow('Recipients file is empty.'))
        return
      }

      const members = ids.map((id) => {
        const member = membersRepo.findById(id)
        if (!member) {
          console.error(chalk.red(`Member with ID ${id} not found.`))
          process.exit(1)
        }
        return member
      })

      let template: { subject: string; body: string }
      try {
        template = resolveTemplate(opts.template)
      } catch (err: unknown) {
        console.error(chalk.red(`Error loading template: ${(err as Error).message}`))
        process.exit(1)
      }

      let pdfPath: string
      try {
        pdfPath = findLatestPdf()
      } catch (err: unknown) {
        console.error(chalk.red((err as Error).message))
        process.exit(1)
      }

      console.log(chalk.cyan(`Attaching directory: ${path.basename(pdfPath)}`))

      if (opts.dryRun) {
        console.log(chalk.yellow('\n[Dry run — no emails will be sent]\n'))
      }

      for (const member of members) {
        if (!member.email) {
          console.log(chalk.yellow(`  No email — skipping: ${member.firstName} ${member.lastName ?? ''}`))
          continue
        }

        const rendered = renderEmail(template, member)

        if (opts.dryRun) {
          console.log(chalk.bold(`--- To: ${member.firstName} ${member.lastName ?? ''} <${member.email}> ---`))
          console.log(chalk.dim(`Subject: ${rendered.subject}`))
          console.log(rendered.body)
          console.log()
        } else {
          process.stdout.write(`  Sending to ${member.firstName} ${member.lastName ?? ''} <${member.email}>... `)
          try {
            await sendEmail(member.email, rendered.subject, rendered.body, pdfPath)
            console.log(chalk.green('Sent.'))
          } catch (err: unknown) {
            console.log(chalk.red(`Error: ${(err as Error).message}`))
          }
        }
      }

      if (!opts.dryRun) {
        console.log(chalk.green('\nDone.'))
      }
    })
}
