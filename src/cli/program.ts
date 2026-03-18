import { Command } from 'commander'
import { registerImportCommand } from './commands/import.command'
import { registerMemberCommand } from './commands/member.command'
import { registerRelationshipCommand } from './commands/relationship.command'
import { registerMediaCommand } from './commands/media.command'
import { registerPdfCommand } from './commands/pdf.command'
import { registerTreeCommand } from './commands/tree.command'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('fam')
    .description('Durán Mazuera family directory CLI')
    .version('1.0.0')

  registerImportCommand(program)
  registerMemberCommand(program)
  registerRelationshipCommand(program)
  registerMediaCommand(program)
  registerPdfCommand(program)
  registerTreeCommand(program)

  return program
}
