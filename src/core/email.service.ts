import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import Mustache from 'mustache'
import type { Member } from './types'

export function resolveTemplate(name: string): { subject: string; body: string } {
  const famDir = process.env.FAM_DIR
  if (!famDir) throw new Error('FAM_DIR is not set')

  const templatePath = path.join(famDir, 'email-templates', `${name}.txt`)
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

export function renderEmail(
  template: { subject: string; body: string },
  member: Member
): { subject: string; body: string } {
  const view = { ...member }
  return {
    subject: Mustache.render(template.subject, view),
    body: Mustache.render(template.body, view),
  }
}

export function findLatestPdf(): string {
  const outputDir = path.resolve(process.cwd(), 'data/output')
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
  if (!user || !pass) {
    throw new Error('FAM_SMTP_USER and FAM_SMTP_PASS environment variables are required')
  }

  return nodemailer.createTransport({
    host: process.env.FAM_SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.FAM_SMTP_PORT ?? 587),
    secure: false,
    auth: { user, pass },
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachmentPath: string
): Promise<void> {
  const transport = createTransport()
  const from = process.env.FAM_SMTP_FROM ?? process.env.FAM_SMTP_USER

  await transport.sendMail({
    from,
    to,
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
