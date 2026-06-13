import { IGNORE_PRESETS } from './constants.js'
import { matchesAny } from './glob.js'
import { computeCutCandidates, deriveStatusWarnings } from './budget/validator.js'
import { summarize } from './index.js'

export function resolveIgnoreGlobs(config) {
  const explicit = config.budget?.ignore ?? []
  const presets = config.budget?.ignore_presets ?? []
  const fromPresets = presets.flatMap(name => IGNORE_PRESETS[name]?.globs ?? [])
  return [...explicit, ...fromPresets]
}

export function applyIgnore(resources, ignoreGlobs) {
  const sumBytes = list => list.reduce((s, r) => s + r.bytes, 0)
  if (!ignoreGlobs || ignoreGlobs.length === 0) {
    return { counted: resources, ignored: [], countedBytes: sumBytes(resources), ignoredBytes: 0 }
  }
  const counted = []
  const ignored = []
  for (const r of resources) {
    if (matchesAny(r.displayPath, ignoreGlobs)) ignored.push(r)
    else counted.push(r)
  }
  return { counted, ignored, countedBytes: sumBytes(counted), ignoredBytes: sumBytes(ignored) }
}

export function applyIgnoreToPage(page, ignoreGlobs, config) {
  const { counted, ignored, countedBytes, ignoredBytes } = applyIgnore(page.resources, ignoreGlobs)
  const limitBytes = page.limitBytes
  const hasOverride = limitBytes !== config.budget.default
  const overBudget = countedBytes > limitBytes

  const baseWarnings = page.warnings.filter(w => w.code !== 'E13' && w.code !== 'E14')
  const warnings = [...baseWarnings, ...deriveStatusWarnings(counted, countedBytes, limitBytes, hasOverride, page.file)]
  const status = overBudget ? 'fail' : warnings.length > 0 ? 'warn' : 'pass'

  return {
    ...page,
    totalBytes: countedBytes,
    overBudget,
    status,
    resources: counted,
    ignoredResources: ignored,
    ignoredBytes,
    warnings,
    cutCandidates: computeCutCandidates(counted, countedBytes, limitBytes, overBudget),
  }
}

export function applyIgnoreToSummary(summary, ignoreGlobs, config) {
  const results = summary.results.map(page => applyIgnoreToPage(page, ignoreGlobs, config))
  const recomputed = summarize(results, summary.outputDir, summary.siteWarnings)
  recomputed.generatedAt = summary.generatedAt
  return recomputed
}
