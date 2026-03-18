import { Command } from 'commander'
import { importCsv } from '../../import/csv.importer'
import { db } from '../../db/client'
import { members, relationships } from '../../db/schema'

export function registerImportCommand(program: Command): void {
  const importCmd = program.command('import').description('Import and inspect data')

  importCmd
    .command('csv [file]')
    .description('Import CSV data into SQLite (default: data/duranmazuera-id.csv)')
    .action(async (file?: string) => {
      const path = file ?? 'data/duranmazuera-id.csv'
      console.log(`Importing from ${path}...`)
      await importCsv(path)
    })

  importCmd
    .command('status')
    .description('Show database record counts')
    .action(() => {
      const memberCount = db.select().from(members).all().length
      const relCount = db.select().from(relationships).all().length
      console.log(`Members:       ${memberCount}`)
      console.log(`Relationships: ${relCount}`)
    })
}
