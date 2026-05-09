import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import Mustache from 'mustache'
import type { Member } from './types'
import { findById } from './members.repository'
import { config } from '../config'

function emailTemplatesDir(): string {
  return path.join(config.dir, 'email-templates')
}

export function resolveTemplate(name: string): { subject: string; body: string } {
  const templatePath = path.join(emailTemplatesDir(), `${name}.txt`)
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`)
  }

  const content = fs.readFileSync(templatePath, 'utf-8')
  const lines = content.split('\n')
  const subjectLine = lines[0]
  if (!subjectLine.startsWith('Subject: ')) {
    throw new Error('First line of template must start with "Subject: "')
  }

  const subject = subjectLine.slice('Subject: '.length).trim()
  const body = lines.slice(2).join('\n').trim()
  return { subject, body }
}

export function resolveSenders(): { name: string; email: string | null }[] {
  return config.senders.map((id) => {
    const member = findById(id)
    if (!member) throw new Error(`senders: member ${id} not found`)
    return {
      name: [member.firstName, member.lastName].filter(Boolean).join(' '),
      email: member.email ?? null,
    }
  })
}

export function renderEmail(
  template: { subject: string; body: string },
  member: Member,
  senders: { name: string; email: string | null }[],
  pdfUrl?: string
): { subject: string; body: string } {
  const sendersView = Object.fromEntries(
    senders.map((s, i) => [
      `sender${i + 1}`,
      s.email ? `${s.name} (${s.email})` : s.name,
    ])
  )
  const view = { ...member, ...sendersView, ...(pdfUrl ? { pdfUrl } : {}) }
  return {
    subject: Mustache.render(template.subject, view),
    body: Mustache.render(template.body, view),
  }
}

export function findLatestPdf(): string {
  const outputDir = path.join(config.dir, 'data/output')
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output directory does not exist: ${outputDir}`)
  }

  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => {
      const fullPath = path.join(outputDir, f)
      return { fullPath, mtime: fs.statSync(fullPath).mtime }
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  if (files.length === 0) {
    throw new Error('No PDF found in data/output. Generate one first with: fam pdf generate')
  }

  return files[0].fullPath
}

type SmtpConfig = { host: string; user: string; pass: string; from: string; ssl: boolean; port: number }

function createTransport(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.ssl,
    auth: { user: smtp.user, pass: smtp.pass },
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  cc?: string[],
  smtp?: SmtpConfig
): Promise<void> {
  const smtpCfg = smtp ?? config.smtp
  const transport = createTransport(smtpCfg)

  await transport.sendMail({
    from: smtpCfg.from,
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    subject,
    text: body,
  })
}
