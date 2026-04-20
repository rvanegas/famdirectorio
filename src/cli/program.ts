import { Command } from 'commander'
import { registerMemberCommand } from './commands/member.command'
import { registerRelationshipCommand } from './commands/relationship.command'
import { registerMediaCommand } from './commands/media.command'
import { registerPdfCommand } from './commands/pdf.command'
import { registerFamilyCommand } from './commands/family.command'
import { registerDbCommand } from './commands/db.command'
import { registerEmailCommand } from './commands/email.command'
import { registerReportCommand } from './commands/report.command'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('fam')
    .description('Durán Mazuera family directory CLI')
    .version('1.0.0')

  registerMemberCommand(program)
  registerRelationshipCommand(program)
  registerMediaCommand(program)
  registerPdfCommand(program)
  registerFamilyCommand(program)
  registerDbCommand(program)
  registerEmailCommand(program)
  registerReportCommand(program)

  return program
}
