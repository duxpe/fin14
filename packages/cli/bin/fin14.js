#!/usr/bin/env node
import { runDefault } from '../commands/default.js'
import { runAudit } from '../commands/audit.js'

const KNOWN_COMMANDS = new Set(['check', 'audit', 'dev'])
const KNOWN_FLAGS = new Set(['config', 'verbose', 'force', 'strict', 'build', 'all', 'help'])
const DEV_INVALID_FLAGS = new Set(['force', 'strict', 'build'])

function parseArgv(argv) {
  const parsed = {
    command: null,
    args: [],
    flags: {
      config: null,
      verbose: false,
      force: false,
      strict: false,
      build: false,
      all: false,
      help: false,
    },
  }

  let i = 0
  let commandSet = false
  let endOfFlags = false

  while (i < argv.length) {
    const arg = argv[i]

    if (endOfFlags) {
      parsed.args.push(arg)
      i++
      continue
    }

    if (arg === '--') {
      endOfFlags = true
      i++
      continue
    }

    if (arg === '-h') {
      parsed.flags.help = true
      i++
      continue
    }

    if (arg.startsWith('--')) {
      let key, value

      if (arg.includes('=')) {
        const eq = arg.indexOf('=')
        key = arg.slice(2, eq)
        value = arg.slice(eq + 1)
      } else {
        key = arg.slice(2)
        value = null
      }

      if (!KNOWN_FLAGS.has(key)) {
        process.stderr.write('fin14: unknown option: --' + key + '\n')
        process.exit(1)
      }

      if (key === 'config') {
        if (value !== null) {
          parsed.flags.config = value
        } else {
          i++
          if (argv[i] === undefined || argv[i].startsWith('--')) {
            process.stderr.write('fin14: --config requires a path argument\n')
            process.exit(1)
          }
          parsed.flags.config = argv[i]
        }
      } else if (key === 'help') {
        parsed.flags.help = true
      } else {
        parsed.flags[key] = true
      }

      i++
      continue
    }

    if (arg.startsWith('-')) {
      process.stderr.write('fin14: unknown option: ' + arg + '\n')
      process.exit(1)
    }

    if (!commandSet && KNOWN_COMMANDS.has(arg)) {
      parsed.command = arg
      commandSet = true
    } else {
      parsed.args.push(arg)
    }

    i++
  }

  return parsed
}

function printUsage() {
  process.stdout.write(
    'fin14 [dir]               measure and validate all pages\n' +
    'fin14 check [dir]         alias for default command\n' +
    'fin14 audit <file.html>   detailed report for a single page\n' +
    'fin14 audit --all [dir]   detailed report for all pages\n' +
    'fin14 dev [dir]           watch mode with live report at http://localhost:4214\n' +
    '\n' +
    'global flags:\n' +
    '  --config <path>         path to fin14.toml\n' +
    '  --verbose               detailed output\n' +
    '\n' +
    'default / check / audit flags:\n' +
    '  --force                 exit 0 even on budget failures\n' +
    '  --strict                fail on strict-mode warnings (external resources, near-limit pages, unknown budget)\n' +
    '  --build                 run build_command before measuring\n'
  )
}

const parsed = parseArgv(process.argv.slice(2))

if (parsed.command === 'dev') {
  for (const flag of DEV_INVALID_FLAGS) {
    if (parsed.flags[flag]) {
      process.stderr.write('fin14: --' + flag + ' is not valid for the dev command\n')
      process.exit(1)
    }
  }
}

if (parsed.flags.help) {
  printUsage()
  process.exit(0)
}

switch (parsed.command) {
  case null:
  case 'check':
    await runDefault(parsed)
    break
  case 'audit':
    await runAudit(parsed)
    break
  case 'dev': {
    const { runDev } = await import('../commands/dev.js')
    await runDev(parsed)
    break
  }
}
