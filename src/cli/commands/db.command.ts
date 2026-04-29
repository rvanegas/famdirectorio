import { Command } from 'commander'
import { copyFileSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { config } from '../../config'

const dbPath = path.join(config.dir, 'db', 'family.db')

function timestamp(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

export function registerDbCommand(program: Command): void {
  const dbCmd = program.command('db').description('Database utilities')

  dbCmd
    .command('shell')
    .description('Open an interactive sqlite3 shell on family.db')
    .action(() => {
      const result = spawnSync('sqlite3', [dbPath], { stdio: 'inherit' })
      if (result.error) {
        process.stderr.write(`sqlite3 not found: ${result.error.message}\n`)
        process.exit(1)
      }
      process.exit(result.status ?? 0)
    })

  dbCmd
    .command('backup')
    .description('Copy family.db to a timestamped backup file')
    .action(() => {
      const dest = `${dbPath}.${timestamp()}.backup`
      copyFileSync(dbPath, dest)
      console.log(`Backup written to ${dest}`)
    })
}
