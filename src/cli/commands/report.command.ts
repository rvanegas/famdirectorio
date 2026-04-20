import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import * as membersRepo from '../../core/members.repository'
import * as emailLogRepo from '../../core/emailLog.repository'
import { membersTable } from '../utils/table'

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*m/g, '')
}

export function registerReportCommand(program: Command): void {
  const reportCmd = program.command('report').description('Generate report files')

  reportCmd
    .command('acosar')
    .description('Write acosar.txt (unverified gen≤3) and gracias.txt (email log for "gracias") in CWD')
    .action(() => {
      const cwd = process.cwd()

      // acosar.txt — equivalent to: fam family unverified -g 3
      const d = new Date()
      d.setFullYear(d.getFullYear() - 2)
      const date = d.toISOString().slice(0, 10)
      const unverified = membersRepo.findUnverifiedSince(date, 3)
      const acosarLines = [
        stripAnsi(membersTable(unverified, ['generation', 'phone', 'email', 'requestedAt'])),
        `${unverified.length} member(s) not verified since ${date}`,
      ]
      const today = new Date().toISOString().slice(0, 10)
      const acosarPath = path.join(cwd, `acosar-${today}.txt`)
      fs.writeFileSync(acosarPath, acosarLines.join('\n') + '\n', 'utf8')
      console.log(chalk.green(`Wrote ${acosarPath}`))

      // gracias.txt — equivalent to: fam email log -t gracias
      const entries = emailLogRepo.findAll().filter(e => e.template === 'gracias')
      let graciasContent: string
      if (entries.length === 0) {
        graciasContent = 'No emails logged yet.\n'
      } else {
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
        const header =
          pad('MemberID', colW.memberId) +
          pad('Date', colW.date) +
          pad('Template', colW.template) +
          pad('Status', colW.status) +
          pad('PDF', colW.pdf) +
          pad('Name', colW.name) +
          'To'
        const rows = entries.map(e =>
          pad(String(e.memberId), colW.memberId) +
          pad(dateOnly(e.sentAt), colW.date) +
          pad(e.template, colW.template) +
          pad(e.status, colW.status) +
          pad(pdfVersion(e.pdfName ?? null), colW.pdf) +
          pad(memberName(e.memberId), colW.name) +
          e.toEmail +
          (e.error ? ` — ${e.error}` : '')
        )
        graciasContent = [header, ...rows, `${entries.length} entries`].join('\n') + '\n'
      }
      const graciasPath = path.join(cwd, `gracias-${today}.txt`)
      fs.writeFileSync(graciasPath, graciasContent, 'utf8')
      console.log(chalk.green(`Wrote ${graciasPath}`))
    })
}
