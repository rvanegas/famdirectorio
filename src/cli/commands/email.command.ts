import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import * as membersRepo from '../../core/members.repository'
import * as emailLogRepo from '../../core/emailLog.repository'
import {
  resolveTemplate,
  resolveRecipientIds,
  renderEmail,
  resolveSenders,
  findLatestPdf,
  sendEmail,
} from '../../core/email.service'

type Member = NonNullable<ReturnType<typeof membersRepo.findById>>

function resolveRecipients(opts: { template: string; generation?: number }): Member[] | null {
  if (opts.generation != null) {
    const members = membersRepo.findAll().filter((m) => membersRepo.getGeneration(m.id) <= opts.generation!)
    if (members.length === 0) {
      console.log(chalk.yellow(`No members found up to generation ${opts.generation}.`))
      return null
    }
    return members
  }

  let ids: number[]
  try {
    ids = resolveRecipientIds(opts.template)
  } catch (err: unknown) {
    console.error(chalk.red((err as Error).message))
    process.exit(1)
  }

  if (ids.length === 0) {
    console.log(chalk.yellow('Recipients file is empty.'))
    return null
  }

  return ids.map((id) => {
    const member = membersRepo.findById(id)
    if (!member) {
      console.error(chalk.red(`Member with ID ${id} not found.`))
      process.exit(1)
    }
    return member
  })
}

export function registerEmailCommand(program: Command): void {
  const emailCmd = program.command('email').description('Send emails to family members')

  emailCmd
    .command('list')
    .description('List members who would receive the email')
    .requiredOption('-t, --template <name>', 'Template name (without extension)')
    .option('-g, --generation <n>', 'Members up to and including generation N', parseInt)
    .action((opts) => {
      const members = resolveRecipients(opts)
      if (!members) return

      const withEmail = members.filter((m) => m.email)
      const noEmail = members.filter((m) => !m.email)

      console.log(chalk.bold(`\nRecipients (${withEmail.length} with email, ${noEmail.length} skipped):\n`))
      for (const m of withEmail) {
        const gen = membersRepo.getGeneration(m.id)
        console.log(`  Gen ${gen}  ${m.firstName} ${m.lastName ?? ''}  <${m.email}>`)
      }
      if (noEmail.length > 0) {
        console.log(chalk.yellow(`\nNo email (skipped):`))
        for (const m of noEmail) {
          console.log(chalk.yellow(`  ${m.firstName} ${m.lastName ?? ''}`))
        }
      }
      console.log()
    })

  emailCmd
    .command('send')
    .description('Send an email with the directory attached; reads <template>.ids.txt for recipients')
    .requiredOption('-t, --template <name>', 'Template name (without extension)')
    .option('-g, --generation <n>', 'Send to all members up to and including generation N', parseInt)
    .option('--dry-run', 'Print emails to stdout without sending')
    .action(async (opts) => {
      const members = resolveRecipients(opts)
      if (!members) return

      let template: { subject: string; body: string }
      try {
        template = resolveTemplate(opts.template)
      } catch (err: unknown) {
        console.error(chalk.red(`Error loading template: ${(err as Error).message}`))
        process.exit(1)
      }

      const senders = resolveSenders()

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

        const rendered = renderEmail(template, member, senders)

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
            emailLogRepo.logEmail({ memberId: member.id, toEmail: member.email, template: opts.template, subject: rendered.subject, pdfName: path.basename(pdfPath), status: 'sent', error: null })
          } catch (err: unknown) {
            console.log(chalk.red(`Error: ${(err as Error).message}`))
            emailLogRepo.logEmail({ memberId: member.id, toEmail: member.email, template: opts.template, subject: rendered.subject, pdfName: path.basename(pdfPath), status: 'error', error: (err as Error).message })
          }
        }
      }

      if (!opts.dryRun) {
        console.log(chalk.green('\nDone.'))
      }
    })

  emailCmd
    .command('log')
    .description('Show sent email history')
    .action(() => {
      const entries = emailLogRepo.findAll()
      if (entries.length === 0) {
        console.log(chalk.dim('No emails logged yet.'))
        return
      }
      const header = chalk.cyan(
        `${'ID'.padEnd(6)}${'MemberID'.padEnd(10)}${'Date'.padEnd(20)}${'To'.padEnd(30)}${'Template'.padEnd(16)}${'Status'.padEnd(10)}PDF`
      )
      const rows = entries.map(e =>
        `${String(e.id).padEnd(6)}${String(e.memberId).padEnd(10)}${(e.sentAt ?? '').padEnd(20)}${e.toEmail.padEnd(30)}${e.template.padEnd(16)}${e.status === 'sent' ? chalk.green('sent'.padEnd(10)) : chalk.red('error'.padEnd(10))}${(e.pdfName?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? e.pdfName ?? '-')}${e.error ? chalk.dim(` — ${e.error}`) : ''}`
      )
      console.log([header, ...rows].join('\n'))
      console.log(chalk.dim(`${entries.length} entries`))
    })
}
