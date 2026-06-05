import { BYTES_PER_KB, DEFAULT_CONFIG, loadConfig, measurePage, measureSite } from '@fin14/core'
import { resolve, dirname } from 'node:path'
import { stat } from 'node:fs/promises'
import { formatBytes, statusSymbol, separator, formatWarning, formatCutCandidate, formatGroupLine, effectiveStatus, recount, printConfigNotices } from './format.js'

function printAuditBlock(result, isTTY, excluded = new Set(), minBytes = 0) {
  const out = process.stdout.write.bind(process.stdout)
  const sep = separator() + '\n'

  out('  audit  ' + result.file + '\n')
  out(sep)

  const sym = statusSymbol(effectiveStatus(result, excluded), isTTY)
  const tKb = (result.totalBytes / BYTES_PER_KB).toFixed(1)
  const lKb = (result.limitBytes / BYTES_PER_KB).toFixed(1)
  const over = result.overBudget
    ? '   +' + ((result.totalBytes - result.limitBytes) / BYTES_PER_KB).toFixed(1) + ' kB'
    : ''
  out('  total    ' + tKb + ' / ' + lKb + ' kB   ' + sym + over + '\n')

  out(sep)

  const groups = { html: [], css: [], js: [], images: [], external: [] }
  for (const r of result.resources) groups[r.group].push(r)

  out(formatGroupLine('HTML',   groups.html,     isTTY) + '\n')
  out(formatGroupLine('CSS',    groups.css,      isTTY) + '\n')
  out(formatGroupLine('JS',     groups.js,       isTTY) + '\n')
  out(formatGroupLine('Images', groups.images,   isTTY) + '\n')
  out(formatGroupLine('Ext',    groups.external, isTTY) + '\n')

  out(sep)

  const visibleCuts = result.cutCandidates.map(c => formatCutCandidate(c, isTTY, minBytes)).filter(l => l !== null)
  if (visibleCuts.length > 0) {
    out('  cut candidates\n')
    for (const line of visibleCuts) {
      out(line + '\n')
    }
  }

  const strictWarnings = result.warnings.filter(w => w.strictFailure && !excluded.has(w.code))
  if (strictWarnings.length > 0) {
    out(sep)
    for (const w of strictWarnings) {
      out(formatWarning(w, isTTY, true) + '\n')
    }
  }
}

export async function runAudit(parsed) {
  const isTTY = process.stdout.isTTY ?? false

  if (!parsed.flags.all) {
    if (!parsed.args[0]) {
      process.stderr.write('fin14 audit: no file specified\n')
      process.exit(1)
    }

    if (!parsed.args[0].endsWith('.html')) {
      process.stderr.write('fin14 audit: file must be an .html file\n')
      process.exit(1)
    }

    const absPath = resolve(process.cwd(), parsed.args[0])

    try {
      await stat(absPath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        process.stderr.write('fin14 audit: file not found: ' + parsed.args[0] + '\n')
        process.exit(1)
      }
      throw err
    }

    let config
    try {
      config = await loadConfig({ config: parsed.flags.config })
    } catch (err) {
      process.stderr.write(err.message + '\n')
      process.exit(1)
    }

    if (config.project.output_dir === null) {
      config = { ...config, project: { ...config.project, output_dir: dirname(absPath) } }
    }

    printConfigNotices(config)

    const excluded = new Set(config.warnings?.exclude ?? [])
    const minBytes = config.budget?.cut_candidate_min_bytes ?? DEFAULT_CONFIG.budget.cut_candidate_min_bytes

    const result = await measurePage(absPath, config)

    printAuditBlock(result, isTTY, excluded, minBytes)

    if (result.overBudget && !parsed.flags.force) {
      process.stdout.write('\n  Use --force to ignore budget failures.\n')
    }

    const hasOverBudget = result.overBudget
    const hasStrictFailure = result.warnings.some(w => w.strictFailure && !excluded.has(w.code))

    let shouldFail = false
    if (hasOverBudget && !parsed.flags.force) shouldFail = true
    if (hasStrictFailure && parsed.flags.strict) shouldFail = true
    process.exit(shouldFail ? 1 : 0)
  }

  let config
  try {
    config = await loadConfig({ config: parsed.flags.config, outputDir: parsed.args[0] })
  } catch (err) {
    process.stderr.write(err.message + '\n')
    process.exit(1)
  }

  printConfigNotices(config)

  const excluded = new Set(config.warnings?.exclude ?? [])
  const minBytes = config.budget?.cut_candidate_min_bytes ?? DEFAULT_CONFIG.budget.cut_candidate_min_bytes

  const outputDir = parsed.args[0] ?? config.project.output_dir
  if (!outputDir) {
    process.stderr.write('fin14 audit: no output directory specified and none found in config\n')
    process.exit(1)
  }

  let summary
  try {
    summary = await measureSite(outputDir, config)
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write('fin14 audit: directory not found: ' + outputDir + '\n')
      process.exit(1)
    }
    throw err
  }

  if (summary.pages === 0) {
    process.stderr.write('error  no HTML files found in ' + outputDir + '\n')
    process.exit(1)
  }

  for (let i = 0; i < summary.results.length; i++) {
    if (i > 0) process.stdout.write('\n')
    printAuditBlock(summary.results[i], isTTY, excluded, minBytes)
  }

  const counts = recount(summary.results, excluded)
  const sep = separator()
  process.stdout.write(sep + '\n')
  process.stdout.write(
    '  total    ' + summary.pages + ' pages' +
    '   pass ' + counts.pass +
    '   warn ' + counts.warn +
    '   fail ' + counts.fail + '\n'
  )

  const hasOverBudget = summary.results.some(r => r.overBudget)
  const hasStrictFailure = summary.results.some(r => r.warnings.some(w => w.strictFailure && !excluded.has(w.code)))

  let shouldFail = false
  if (hasOverBudget && !parsed.flags.force) shouldFail = true
  if (hasStrictFailure && parsed.flags.strict) shouldFail = true
  process.exit(shouldFail ? 1 : 0)
}
