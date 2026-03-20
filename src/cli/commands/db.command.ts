import { Command } from 'commander'
import { copyFileSync } from 'fs'
import path from 'path'
import os from 'os'

const dbPath = path.join(os.homedir(), 'src', 'fam', 'db', 'family.db')

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
    .command('backup')
    .description('Copy family.db to a timestamped backup file')
    .action(() => {
      const dest = `${dbPath}.${timestamp()}.backup`
      copyFileSync(dbPath, dest)
      console.log(`Backup written to ${dest}`)
    })
}
