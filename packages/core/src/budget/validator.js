import { BYTES_PER_KB, STRICT_IPV6_LIMIT_BYTES } from '../constants.js'

export function validate(results, skipped, warnings, config, file) {
  const limitBytes = config.budget.default
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0)
  const overBudget = totalBytes > limitBytes
  const unknownBudget = warnings.some(w => w.code === 'E19')

  const newWarnings = [...warnings]

  if (totalBytes > STRICT_IPV6_LIMIT_BYTES && !overBudget) {
    newWarnings.push({
      code: 'E13',
      message: `${file}: ${(totalBytes / BYTES_PER_KB).toFixed(1)}kB exceeds IPv6 heuristic (12.2kB)`,
      path: file,
      strictFailure: true,
    })
  }

  for (const result of results) {
    if (result.external === true) {
      newWarnings.push({
        code: 'E14',
        message: `external resource counted: ${result.displayPath}`,
        path: result.path,
        strictFailure: true,
      })
    }
  }

  const status = overBudget ? 'fail' : newWarnings.length > 0 ? 'warn' : 'pass'

  const cutCandidates = computeCutCandidates(results, totalBytes, limitBytes, overBudget)

  return {
    file,
    totalBytes,
    limitBytes,
    status,
    overBudget,
    unknownBudget,
    resources: results,
    skippedResources: skipped,
    warnings: newWarnings,
    cutCandidates,
  }
}

function computeCutCandidates(results, totalBytes, limitBytes, overBudget) {
  const sorted = [...results].sort((a, b) => b.bytes - a.bytes)

  if (overBudget) {
    const overage = totalBytes - limitBytes
    const candidates = []
    let cumulative = 0
    for (const resource of sorted) {
      candidates.push(resource)
      cumulative += resource.bytes
      if (cumulative >= overage) break
    }
    return candidates.length > 0 ? candidates : [sorted[0]]
  } else {
    return sorted.slice(0, 3)
  }
}
