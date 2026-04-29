import fs from 'fs'
import os from 'os'
import path from 'path'
import { parse } from 'smol-toml'
import { z } from 'zod'

const CONFIG_PATH = path.join(os.homedir(), '.config', 'famdirectorio', 'config.toml')

const ConfigSchema = z.object({
  dir: z.string(),
  senders: z.array(z.number().int()).default([]),
  smtp: z.object({
    host: z.string(),
    user: z.string(),
    pass: z.string(),
    from: z.string(),
    port: z.number().int().optional(),
    ssl: z.boolean().default(false),
  }),
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
  return {
    dir: c.dir,
    senders: c.senders,
    smtp: {
      host: c.smtp.host,
      user: c.smtp.user,
      pass: c.smtp.pass,
      from: c.smtp.from,
      ssl: c.smtp.ssl,
      port: c.smtp.port ?? (c.smtp.ssl ? 465 : 587),
    },
  }
}

export const config = loadConfig()
