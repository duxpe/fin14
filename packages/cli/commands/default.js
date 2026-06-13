import { BYTES_PER_KB, DEFAULT_CONFIG, applyIgnoreToSummary, loadConfig, measureSite, resolveIgnoreGlobs } from '@fin14/core'
import { spawn } from 'node:child_process'
import { stat, readFile } from 'node:fs/promises'
import { formatBytes, statusSymbol, formatWarning, formatCutCandidateLines, formatIgnoredLine, buildSystemicHint, detectFramework, pageGroupSummary, dim, green, effectiveStatus, recount, printConfigNotices } from './format.js'
import { toJsonReport, githubAnnotations, diffBaseline, formatBaselineDiff } from './reporters.js'

async function loadBaselineDiff(path, summary, minDeltaBytes) {
  let report
  try {
    report = JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    process.stderr.write('fin14: baseline skipped — ' + err.message + '\n')
    return null
  }
  return diffBaseline(summary, report, minDeltaBytes)
}

function resolveBaselineMinDelta(parsed, config) {
  const flag = parsed.flags['baseline-min-delta']
  if (flag != null) {
    const n = Number(flag)
    if (!Number.isInteger(n) || n < 0) {
      process.stderr.write('fin14: --baseline-min-delta requires a non-negative integer\n')
      process.exit(2)
    }
    return n
  }
  return config.budget.baseline_min_delta_bytes
}

function ignoreSourceLabel(config) {
  const presets = config.budget?.ignore_presets ?? []
  if (presets.length > 0) return presets.join(', ') + ' preset' + (presets.length > 1 ? 's' : '')
  return 'budget.ignore'
}

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
    process.exit(2)
  }

  printConfigNotices(config)

  const outputDir = parsed.args[0] ?? config.project.output_dir
  if (outputDir == null) {
    process.stderr.write('fin14: no output directory found\n')
    process.exit(2)
  }

  let buildFailed = false

  if (parsed.flags.build) {
    if (!config.project.build_command) {
      process.stderr.write('fin14: --build requires build_command in fin14.toml\n')
      process.exit(2)
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
        process.exit(2)
      }
      process.stderr.write('fin14: build failed — measuring stale output\n')
      buildFailed = true
    }
  }

  const excluded = new Set(config.warnings?.exclude ?? [])

  let summary
  try {
    summary = await measureSite(outputDir, config)
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write('error  ' + outputDir + ' not found\n')
    } else {
      process.stderr.write(err.message + '\n')
    }
    process.exit(2)
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
    process.exit(2)
  }

  summary = applyIgnoreToSummary(summary, resolveIgnoreGlobs(config), config)

  let baselineDiff = null
  if (parsed.flags.baseline) {
    const minDeltaBytes = resolveBaselineMinDelta(parsed, config)
    baselineDiff = await loadBaselineDiff(parsed.flags.baseline, summary, minDeltaBytes)
  }

  const hasOverBudget = summary.results.some(r => r.overBudget)
  const hasStrictFailure =
    summary.results.some(r => r.warnings.some(w => w.strictFailure && !excluded.has(w.code))) ||
    summary.siteWarnings.some(w => w.strictFailure && !excluded.has(w.code))

  let shouldFail = false
  if (hasOverBudget && !parsed.flags.force) shouldFail = true
  if (hasStrictFailure && parsed.flags.strict) shouldFail = true

  if (parsed.flags.json) {
    process.stdout.write(JSON.stringify(toJsonReport(summary, baselineDiff), null, 2) + '\n')
    process.exit(shouldFail ? 1 : 0)
  }

  const counts = recount(summary.results, excluded)
  process.stdout.write(
    '  pass ' + counts.pass +
    '   warn ' + counts.warn +
    '   fail ' + counts.fail +
    '   ' + summary.pages + ' pages\n'
  )

  const visibleSiteWarnings = summary.siteWarnings.filter(w => !excluded.has(w.code))
  for (const siteWarning of visibleSiteWarnings) {
    process.stdout.write(formatWarning(siteWarning, isTTY) + '\n')
  }

  const minBytes = config.budget?.cut_candidate_min_bytes ?? DEFAULT_CONFIG.budget.cut_candidate_min_bytes

  const flaggedPages = summary.results
    .filter(r => r.overBudget || r.warnings.length > 0)
    .sort((a, b) => {
      const order = { fail: 0, warn: 1, pass: 2 }
      const sd = (order[effectiveStatus(a, excluded)] ?? 2) - (order[effectiveStatus(b, excluded)] ?? 2)
      return sd !== 0 ? sd : b.totalBytes - a.totalBytes
    })

  for (const result of flaggedPages) {
    const visibleWarnings = result.warnings.filter(w => !excluded.has(w.code))
    const totalKb = (result.totalBytes / BYTES_PER_KB).toFixed(1)
    const limitKb = (result.limitBytes / BYTES_PER_KB).toFixed(1)
    const overKb = result.overBudget
      ? '   +' + ((result.totalBytes - result.limitBytes) / BYTES_PER_KB).toFixed(1) + ' kB'
      : ''
    process.stdout.write(
      '\n  ' + statusSymbol(effectiveStatus(result, excluded), isTTY) +
      '  ' + result.file +
      '    ' + totalKb + ' / ' + limitKb + ' kB' + overKb + '\n'
    )
    const groups = pageGroupSummary(result)
    if (groups) process.stdout.write('     ' + groups + '\n')
    if (result.ignoredBytes > 0) {
      process.stdout.write(formatIgnoredLine(result.ignoredBytes, ignoreSourceLabel(config), isTTY) + '\n')
    }
    for (const line of formatCutCandidateLines(result, isTTY, minBytes)) {
      process.stdout.write(line + '\n')
    }
    for (const w of visibleWarnings) {
      process.stdout.write(formatWarning(w, isTTY) + '\n')
    }
  }

  if (counts.fail === 0 && counts.warn === 0) {
    process.stdout.write('  ' + green('✓', isTTY) + '  all pages within budget\n')
  }

  const ignoredAssets = new Map()
  for (const r of summary.results) {
    for (const ig of r.ignoredResources ?? []) ignoredAssets.set(ig.key, ig.bytes)
  }
  if (ignoredAssets.size > 0) {
    const uniqueIgnored = [...ignoredAssets.values()].reduce((a, b) => a + b, 0)
    process.stdout.write(
      '  ' + dim('ignored ' + formatBytes(uniqueIgnored) + ' via ' + ignoreSourceLabel(config) +
      ' (' + ignoredAssets.size + ' asset' + (ignoredAssets.size === 1 ? '' : 's') + ')', isTTY) + '\n'
    )
  }

  const systemicHint = buildSystemicHint(summary, detectFramework(summary))
  if (systemicHint) {
    process.stdout.write('\n  ' + dim('hint  ' + systemicHint, isTTY) + '\n')
  }

  if (parsed.flags.verbose) {
    for (const result of summary.results) {
      if (result.status !== 'pass') continue
      process.stdout.write(
        '\n  ' + statusSymbol('pass', isTTY) + '  ' + result.file + '\n'
      )
      const groups = pageGroupSummary(result)
      if (groups) process.stdout.write('     ' + groups + '\n')
      if (result.ignoredBytes > 0) {
        process.stdout.write(formatIgnoredLine(result.ignoredBytes, ignoreSourceLabel(config), isTTY) + '\n')
      }
    }
  }

  if (baselineDiff) {
    process.stdout.write('\n' + formatBaselineDiff(baselineDiff, isTTY) + '\n')
  }

  if (hasOverBudget && !parsed.flags.force) {
    process.stdout.write('\n  Use --force to ignore budget failures.\n')
  }

  if (process.env.GITHUB_ACTIONS === 'true' || parsed.flags.github) {
    for (const line of githubAnnotations(summary, outputDir, excluded)) {
      process.stdout.write(line + '\n')
    }
  }

  process.exit(shouldFail ? 1 : 0)
}
