import { Command } from 'commander'
import chalk from 'chalk'
import { generatePdf } from '../../pdf/generator'

export function registerPdfCommand(program: Command): void {
  const pdfCmd = program.command('pdf').description('Generate PDF family directory')

  pdfCmd
    .command('generate')
    .description('Generate the family yearbook PDF')
    .option('-b, --branch <name>', 'Generate for a specific branch only')
    .option('-m, --member <id>', 'Generate a single-member page')
    .option('-o, --output <path>', 'Output file path')
    .action(async (opts) => {
      console.log(chalk.cyan('Generating PDF...'))
      try {
        const outputPath = await generatePdf({
          branchName: opts.branch,
          memberId: opts.member ? parseInt(opts.member, 10) : undefined,
          outputPath: opts.output,
        })
        console.log(chalk.green(`PDF written to: ${outputPath}`))
      } catch (err) {
        console.error(chalk.red('PDF generation failed:'), err)
        process.exit(1)
      }
    })
}
