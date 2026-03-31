import { Command } from 'commander'
import chalk from 'chalk'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { generatePdf } from '../../pdf/generator'

export function registerPdfCommand(program: Command): void {
  const pdfCmd = program.command('pdf').description('Generate PDF family directory')

  pdfCmd
    .command('generate')
    .description('Generate the family yearbook PDF')
    .option('-o, --output <path>', 'Output file path')
    .action(async (opts) => {
      console.log(chalk.cyan('Generating PDF...'))
      try {
        const outputDir = path.resolve(process.cwd(), 'data/output')
        if (fs.existsSync(outputDir)) {
          for (const file of fs.readdirSync(outputDir)) {
            if (file.endsWith('.pdf')) {
              fs.unlinkSync(path.join(outputDir, file))
            }
          }
        }
        const outputPath = await generatePdf({ outputPath: opts.output })
        console.log(chalk.green(`PDF written to: ${outputPath}`))
        execSync(`open "${outputPath}"`)
      } catch (err) {
        console.error(chalk.red('PDF generation failed:'), err)
        process.exit(1)
      }
    })
}
