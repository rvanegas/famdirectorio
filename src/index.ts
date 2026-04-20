#!/usr/bin/env node
import { createProgram } from './cli/program'

process.on('SIGINT', () => {
  process.stderr.write('Interrupted.\n')
  process.exit(130)
})

const program = createProgram()
program.parse(process.argv)
