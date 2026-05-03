import { loadConfig, measureSite } from '@fin14/core'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { formatBytes, statusSymbol, formatWarning, formatCutCandidate, pageGroupSummary, green } from './format.js'

async function runBuild(command) {
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, stdio: 'inherit' })
    proc.on('close', code => resolve(code ?? 1))
    proc.on('error', () => resolve(1))
  })
}

export async function runDefault(parsed) {
  const isTTY = process.stdout.isTTY === true

  let config
  try {
    config = await loadConfig({ config: parsed.flags.config, outputDir: parsed.args[0] })
  } catch (err) {
    process.stderr.write(err.message + '\n')
    process.exit(1)
  }

  const outputDir = parsed.args[0] ?? config.project.output_dir
  if (outputDir == null) {
    process.stderr.write('fin14: no output directory found\n')
    process.exit(1)
  }

  let buildFailed = false

  if (parsed.flags.build) {
    if (!config.project.build_command) {
      process.stderr.write('fin14: --build requires build_command in fin14.toml\n')
      process.exit(1)
    }
    const code = await runBuild(config.project.build_command)
    if (code !== 0) {
      let dirExists = false
      try {
        await stat(outputDir)
        dirExists = true
      } catch {}
      if (!dirExists) {
        process.stderr.write('fin14: build failed and output dir not found\n')
        process.exit(1)
      }
      process.stderr.write('fin14: build failed — measuring stale output\n')
      buildFailed = true
    }
  }

  let summary
  try {
    summary = await measureSite(outputDir, config)
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write('error  ' + outputDir + ' not found\n')
    } else {
      process.stderr.write(err.message + '\n')
    }
    process.exit(1)
  }

  if (buildFailed) {
    summary.siteWarnings.push({
      code: 'E19',
      message: 'build_command failed — budget measured from stale output',
      strictFailure: true,
    })
  }

  if (summary.pages === 0) {
    process.stderr.write('error  no HTML files found in ' + outputDir + '\n')
    process.exit(1)
  }

  process.stdout.write(
    '  pass ' + summary.pass +
    '   warn ' + summary.warn +
    '   fail ' + summary.fail +
    '   ' + summary.pages + ' pages\n'
  )

  for (const siteWarning of summary.siteWarnings) {
    process.stdout.write(formatWarning(siteWarning, isTTY) + '\n')
  }

  const flaggedPages = summary.results
    .filter(r => r.overBudget || r.warnings.length > 0)
    .sort((a, b) => {
      const order = { fail: 0, warn: 1, pass: 2 }
      const sd = (order[a.status] ?? 2) - (order[b.status] ?? 2)
      return sd !== 0 ? sd : b.totalBytes - a.totalBytes
    })

  for (const result of flaggedPages) {
    const totalKb = (result.totalBytes / 1000).toFixed(1)
    const limitKb = (result.limitBytes / 1000).toFixed(1)
    const overKb = result.overBudget
      ? '   +' + ((result.totalBytes - result.limitBytes) / 1000).toFixed(1) + ' kB'
      : ''
    process.stdout.write(
      '\n  ' + statusSymbol(result.status, isTTY) +
      '  ' + result.file +
      '    ' + totalKb + ' / ' + limitKb + ' kB' + overKb + '\n'
    )
    const groups = pageGroupSummary(result)
    if (groups) process.stdout.write('     ' + groups + '\n')
    for (const c of result.cutCandidates) {
      process.stdout.write(formatCutCandidate(c, isTTY) + '\n')
    }
    for (const w of result.warnings) {
      process.stdout.write(formatWarning(w, isTTY) + '\n')
    }
  }

  if (summary.fail === 0 && summary.warn === 0) {
    process.stdout.write('  ' + green('✓', isTTY) + '  all pages within budget\n')
  }

  if (parsed.flags.verbose) {
    for (const result of summary.results) {
      if (result.status !== 'pass') continue
      process.stdout.write(
        '\n  ' + statusSymbol('pass', isTTY) + '  ' + result.file + '\n'
      )
      const groups = pageGroupSummary(result)
      if (groups) process.stdout.write('     ' + groups + '\n')
    }
  }

  const hasOverBudget = summary.results.some(r => r.overBudget)
  const hasStrictFailure =
    summary.results.some(r => r.warnings.some(w => w.strictFailure)) ||
    summary.siteWarnings.some(w => w.strictFailure)

  if (hasOverBudget && !parsed.flags.force) {
    process.stdout.write('\n  Use --force to ignore budget failures.\n')
  }

  let shouldFail = false
  if (hasOverBudget && !parsed.flags.force) shouldFail = true
  if (hasStrictFailure && parsed.flags.strict) shouldFail = true

  process.exit(shouldFail ? 1 : 0)
}
