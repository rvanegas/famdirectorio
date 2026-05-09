import fs from 'fs'
import os from 'os'
import path from 'path'
import { parse } from 'smol-toml'
import { z } from 'zod'

const CONFIG_PATH = path.join(os.homedir(), '.config', 'famdirectorio', 'config.toml')

const SmtpSchema = z.object({
  host: z.string(),
  user: z.string(),
  pass: z.string(),
  from: z.string(),
  port: z.number().int().optional(),
  ssl: z.boolean().default(false),
})

const S3Schema = z.object({
  bucket: z.string(),
  region: z.string(),
  cloudfront_url: z.string(),
  access_key_id: z.string(),
  secret_access_key: z.string(),
})

const ConfigSchema = z.object({
  dir: z.string(),
  senders: z.array(z.number().int()).default([]),
  smtp: SmtpSchema,
  smtp_alt: SmtpSchema.optional(),
  s3: S3Schema.optional(),
})

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config file not found: ${CONFIG_PATH}`)
    process.exit(1)
  }
  const raw = parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  const result = ConfigSchema.safeParse(raw)
  if (!result.success) {
    console.error(`Invalid config at ${CONFIG_PATH}:`)
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  const c = result.data
  const normSmtp = (s: z.infer<typeof SmtpSchema>) => ({
    host: s.host,
    user: s.user,
    pass: s.pass,
    from: s.from,
    ssl: s.ssl,
    port: s.port ?? (s.ssl ? 465 : 587),
  })
  return {
    dir: c.dir,
    senders: c.senders,
    smtp: normSmtp(c.smtp),
    smtp_alt: c.smtp_alt ? normSmtp(c.smtp_alt) : undefined,
    s3: c.s3,
  }
}

export const config = loadConfig()
