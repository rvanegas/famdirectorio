import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import Mustache from 'mustache'
import type { Member } from './types'
import { findById } from './members.repository'

function emailTemplatesDir(): string {
  const famDir = process.env.FAM_DIR
  if (!famDir) throw new Error('FAM_DIR is not set')
  return path.join(famDir, 'email-templates')
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
  const raw = process.env.FAM_SENDERS
  if (!raw) return []

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const id = parseInt(p, 10)
      if (isNaN(id)) throw new Error(`FAM_SENDERS: invalid member ID "${p}"`)
      const member = findById(id)
      if (!member) throw new Error(`FAM_SENDERS: member ${id} not found`)
      return {
        name: [member.firstName, member.lastName].filter(Boolean).join(' '),
        email: member.email ?? null,
      }
    })
}

export function renderEmail(
  template: { subject: string; body: string },
  member: Member,
  senders: { name: string; email: string | null }[]
): { subject: string; body: string } {
  const sendersView = Object.fromEntries(
    senders.map((s, i) => [
      `sender${i + 1}`,
      s.email ? `${s.name} (${s.email})` : s.name,
    ])
  )
  const view = { ...member, ...sendersView }
  return {
    subject: Mustache.render(template.subject, view),
    body: Mustache.render(template.body, view),
  }
}

export function findLatestPdf(): string {
  const outputDir = path.join(process.env.FAM_DIR!, 'data/output')
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

function createTransport() {
  const user = process.env.FAM_SMTP_USER
  const pass = process.env.FAM_SMTP_PASS
  const host = process.env.FAM_SMTP_HOST
  if (!user || !pass || !host) {
    throw new Error('FAM_SMTP_USER, FAM_SMTP_PASS, and FAM_SMTP_HOST environment variables are required')
  }
  const secure = process.env.FAM_SMTP_SSL === 'true'
  return nodemailer.createTransport({
    host,
    port: Number(process.env.FAM_SMTP_PORT ?? (secure ? 465 : 587)),
    secure,
    auth: { user, pass },
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachmentPath: string,
  cc?: string[]
): Promise<void> {
  const transport = createTransport()

  const from = process.env.FAM_SMTP_FROM
  if (!from) {
    throw new Error('FAM_SMTP_FROM environment variable is required')
  }

  await transport.sendMail({
    from,
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    subject,
    text: body,
    attachments: [
      {
        filename: path.basename(attachmentPath),
        path: attachmentPath,
      },
    ],
  })
}
