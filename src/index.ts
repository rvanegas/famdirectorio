#!/usr/bin/env node
import { createProgram } from './cli/program'

const program = createProgram()
program.parse(process.argv)
