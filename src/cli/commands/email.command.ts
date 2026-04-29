import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import * as membersRepo from '../../core/members.repository'
import * as emailLogRepo from '../../core/emailLog.repository'
import {
  resolveTemplate,
  renderEmail,
  resolveSenders,
  findLatestPdf,
  sendEmail,
} from '../../core/email.service'

type Member = NonNullable<ReturnType<typeof membersRepo.findById>>

function resolveRecipients(opts: { members?: string; generation?: number; all?: boolean }): Member[] | null {
  if (opts.all) {
    return membersRepo.findAll()
  }

  if (opts.members != null) {
    const ids = opts.members.split(',').map((s) => {
      const n = parseInt(s.trim(), 10)
      if (isNaN(n)) {
        console.error(chalk.red(`Invalid member ID: "${s.trim()}"`))
        process.exit(1)
      }
      return n
    })
    return ids.map((id) => {
      const member = membersRepo.findById(id)
      if (!member) {
        console.error(chalk.red(`Member with ID ${id} not found.`))
        process.exit(1)
      }
      return member!
    })
  }

  if (opts.generation != null) {
    const members = membersRepo.findAll().filter((m) => membersRepo.getGeneration(m.id) <= opts.generation!)
    if (members.length === 0) {
      console.log(chalk.yellow(`No members found up to generation ${opts.generation}.`))
      return null
    }
    return members
  }

  console.error(chalk.red('Specify recipients with -a, -m <ids>, or -g <generation>.'))
  process.exit(1)
}

export function registerEmailCommand(program: Command): void {
  const emailCmd = program.command('email').description('Send emails to family members')

  emailCmd
    .command('list')
    .description('List members who would receive the email')
    .requiredOption('-t, --template <name>', 'Template name (without extension)')
    .option('-a, --all', 'All members')
    .option('-m, --members <ids>', 'Comma-separated member IDs')
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
    .description('Send an email with the directory attached')
    .requiredOption('-t, --template <name>', 'Template name (without extension)')
    .option('-a, --all', 'All members')
    .option('-m, --members <ids>', 'Comma-separated member IDs')
    .option('-g, --generation <n>', 'Send to all members up to and including generation N', parseInt)
    .option('-c, --cc-senders', 'CC all senders on every email')
    .option('-d, --dry-run', 'Print emails to stdout without sending')
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

        const ccAddresses = opts.ccSenders
          ? senders.map((s) => s.email).filter((e): e is string => !!e)
          : []

        if (opts.dryRun) {
          console.log(chalk.bold(`--- To: ${member.firstName} ${member.lastName ?? ''} <${member.email}> ---`))
          if (ccAddresses.length > 0) console.log(chalk.dim(`CC: ${ccAddresses.join(', ')}`))
          console.log(chalk.dim(`Subject: ${rendered.subject}`))
          console.log(rendered.body)
          console.log()
        } else {
          process.stdout.write(`  Sending to ${member.firstName} ${member.lastName ?? ''} <${member.email}>... `)
          try {
            await sendEmail(member.email, rendered.subject, rendered.body, pdfPath, ccAddresses)
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
    .option('-t, --template <name>', 'Filter by template name')
    .action((opts: { template?: string }) => {
      let entries = emailLogRepo.findAll()
      if (opts.template) entries = entries.filter(e => e.template === opts.template)
      if (entries.length === 0) {
        console.log(chalk.dim('No emails logged yet.'))
        return
      }
      const dateOnly = (s: string | null | undefined) => (s ?? '').slice(0, 10)

      const pdfVersion = (name: string | null) => {
        const m = name?.match(/v(\d+)/)
        return m ? `v${m[1]}` : '-'
      }

      const memberName = (id: number | null) => {
        if (id == null) return ''
        const m = membersRepo.findById(id)
        return m ? `${m.firstName} ${m.lastName ?? ''}`.trim() : ''
      }

      const colW = {
        memberId: Math.max(8, ...entries.map(e => String(e.memberId).length)),
        date:     Math.max(4, ...entries.map(e => dateOnly(e.sentAt).length)),
        template: Math.max(8, ...entries.map(e => e.template.length)),
        status:   Math.max(6, ...entries.map(e => e.status.length)),
        pdf:      Math.max(3, ...entries.map(e => pdfVersion(e.pdfName ?? null).length)),
        name:     Math.max(4, ...entries.map(e => memberName(e.memberId).length)),
        to:       Math.max(2, ...entries.map(e => e.toEmail.length)),
      }

      const pad = (s: string, w: number) => s.padEnd(w + 2)

      const header = chalk.cyan(
        pad('MemberID', colW.memberId) +
        pad('Date', colW.date) +
        pad('Template', colW.template) +
        pad('Status', colW.status) +
        pad('PDF', colW.pdf) +
        pad('Name', colW.name) +
        'To'
      )
      const rows = entries.map(e =>
        pad(String(e.memberId), colW.memberId) +
        pad(dateOnly(e.sentAt), colW.date) +
        pad(e.template, colW.template) +
        (e.status === 'sent'
          ? chalk.green(pad('sent', colW.status))
          : chalk.red(pad('error', colW.status))) +
        pad(pdfVersion(e.pdfName ?? null), colW.pdf) +
        pad(memberName(e.memberId), colW.name) +
        e.toEmail +
        (e.error ? chalk.dim(` — ${e.error}`) : '')
      )
      console.log([header, ...rows].join('\n'))
      console.log(chalk.dim(`${entries.length} entries`))
    })
}
