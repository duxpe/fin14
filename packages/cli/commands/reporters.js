import { BYTES_PER_KB } from '@fin14/core'
import { red, green, dim } from './format.js'

export const SCHEMA_VERSION = 1
export const BASELINE_MIN_DELTA_BYTES = 100

function kb(bytes) {
  return (bytes / BYTES_PER_KB).toFixed(1)
}

function signedKb(bytes) {
  return (bytes > 0 ? '+' : '') + kb(bytes) + ' kB'
}

function jsonResource(r) {
  return {
    group: r.group,
    type: r.type,
    displayPath: r.displayPath,
    bytes: r.bytes,
    external: r.external,
    inline: r.inline,
  }
}

function jsonResult(page) {
  return {
    file: page.file,
    status: page.status,
    totalBytes: page.totalBytes,
    limitBytes: page.limitBytes,
    overBudget: page.overBudget,
    unknownBudget: page.unknownBudget,
    ignoredBytes: page.ignoredBytes ?? 0,
    warnings: page.warnings.map(w => ({ code: w.code, message: w.message, strictFailure: w.strictFailure })),
    resources: page.resources.map(jsonResource),
    ignoredResources: (page.ignoredResources ?? []).map(jsonResource),
    cutCandidates: page.cutCandidates.map(jsonResource),
  }
}

export function toJsonReport(summary, baseline = null) {
  const report = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: summary.generatedAt,
    outputDir: summary.outputDir,
    pages: summary.pages,
    pass: summary.pass,
    warn: summary.warn,
    fail: summary.fail,
    totalBytes: summary.totalBytes,
    results: summary.results.map(jsonResult),
    topAssets: summary.topAssets.map(jsonResource),
    siteWarnings: summary.siteWarnings.map(w => ({ code: w.code, message: w.message, strictFailure: w.strictFailure })),
  }
  if (baseline) report.baseline = baseline
  return report
}

function annotationPath(outputDir, file) {
  return (outputDir.replace(/\/+$/, '') + '/' + file).replace(/\\/g, '/')
}

export function githubAnnotations(summary, outputDir, excluded = new Set()) {
  const lines = []
  for (const page of summary.results) {
    const file = annotationPath(outputDir, page.file)
    if (page.overBudget) {
      const over = page.totalBytes - page.limitBytes
      lines.push(
        `::error file=${file},title=fin14::${page.file} over budget by ${kb(over)} kB ` +
        `(${kb(page.totalBytes)} / ${kb(page.limitBytes)} kB)`
      )
    }
    for (const w of page.warnings) {
      if (w.strictFailure && !excluded.has(w.code)) {
        lines.push(`::warning file=${file},title=fin14::${page.file}: ${w.message}`)
      }
    }
  }
  return lines
}

export function diffBaseline(summary, baselineReport, minDeltaBytes = BASELINE_MIN_DELTA_BYTES) {
  const baselineResults = Array.isArray(baselineReport?.results) ? baselineReport.results : []
  const before = new Map(baselineResults.map(r => [r.file, r.totalBytes]))
  const current = new Map(summary.results.map(r => [r.file, r.totalBytes]))

  const pages = []
  for (const [file, after] of current) {
    if (!before.has(file)) continue
    const delta = after - before.get(file)
    if (Math.abs(delta) >= minDeltaBytes) {
      pages.push({ file, before: before.get(file), after, delta })
    }
  }
  pages.sort((a, b) => b.delta - a.delta)

  const added = [...current.keys()].filter(f => !before.has(f)).sort()
  const removed = [...before.keys()].filter(f => !current.has(f)).sort()

  return { pages, added, removed }
}

export function formatBaselineDiff(diff, isTTY) {
  if (diff.pages.length === 0 && diff.added.length === 0 && diff.removed.length === 0) {
    return '  ' + dim('baseline: no changes', isTTY)
  }
  const lines = ['  baseline']
  for (const p of diff.pages) {
    const delta = p.delta > 0 ? red(signedKb(p.delta), isTTY) : green(signedKb(p.delta), isTTY)
    lines.push('  → ' + p.file.padEnd(32) + delta)
  }
  for (const f of diff.added) lines.push('  ' + green('+ ' + f + '  (new)', isTTY))
  for (const f of diff.removed) lines.push('  ' + dim('- ' + f + '  (removed)', isTTY))
  return lines.join('\n')
}
