export { loadConfig } from './config.js'
export { gzipLevelClampNotice } from './compress.js'
export * from './constants.js'
import { collect } from './budget/collector.js'
import { measure } from './budget/measurer.js'
import { validate } from './budget/validator.js'
import { crawl } from './crawler.js'
import { relative, resolve } from 'node:path'
import {
  SITE_EMFILE_RETRY_BATCH_SIZE,
  SITE_PAGE_BATCH_SIZE,
  SUMMARY_TOP_ASSET_LIMIT,
} from './constants.js'

export async function measurePage(file, config) {
  const { refs, skipped, warnings: collectWarnings } = await collect(file, config.project.output_dir, config)
  const { results, warnings: measureWarnings, unknownBudget } = await measure(refs, config)
  const allWarnings = [...collectWarnings, ...measureWarnings]
  const relFile = relative(config.project.output_dir, file)
  const pageResult = validate(results, skipped, allWarnings, config, relFile)
  if (unknownBudget) pageResult.unknownBudget = true
  return pageResult
}

export async function measureSite(outputDir, config, options = {}) {
  const configWithDir = { ...config, project: { ...config.project, output_dir: outputDir } }
  const relPaths = await crawl(outputDir)
  const absPaths = relPaths.map(p => resolve(outputDir, p))
  const total = absPaths.length

  options.onStart?.({ total, files: relPaths })

  let batchSize = SITE_PAGE_BATCH_SIZE
  let i = 0
  let done = 0
  const results = []
  const siteWarnings = []

  while (i < absPaths.length) {
    const batch = absPaths.slice(i, i + batchSize)
    try {
      const batchResults = await Promise.all(batch.map(async f => {
        const result = await measurePage(f, configWithDir)
        done++
        options.onPageResult?.(result, { done, total })
        return result
      }))
      results.push(...batchResults)
      i += batch.length
    } catch (err) {
      if (err.code === 'EMFILE' && batchSize > SITE_EMFILE_RETRY_BATCH_SIZE) {
        batchSize = SITE_EMFILE_RETRY_BATCH_SIZE
        siteWarnings.push({ code: 'E15', message: `too many open files — retrying with batch size ${SITE_EMFILE_RETRY_BATCH_SIZE}`, strictFailure: false })
      } else {
        throw err
      }
    }
  }

  return summarize(results, outputDir, siteWarnings)
}

export function summarize(results, outputDir, siteWarnings = []) {
  const pass = results.filter(r => r.status === 'pass').length
  const warn = results.filter(r => r.status === 'warn').length
  const fail = results.filter(r => r.status === 'fail').length
  const totalBytes = results.reduce((s, r) => s + r.totalBytes, 0)

  const seen = new Map()
  for (const page of results) {
    for (const res of page.resources) {
      if (!seen.has(res.key) || seen.get(res.key).bytes < res.bytes) {
        seen.set(res.key, res)
      }
    }
  }
  const topAssets = [...seen.values()].sort((a, b) => b.bytes - a.bytes).slice(0, SUMMARY_TOP_ASSET_LIMIT)

  return {
    outputDir,
    generatedAt: new Date().toISOString(),
    pages: results.length,
    pass,
    warn,
    fail,
    totalBytes,
    topAssets,
    siteWarnings,
    results,
  }
}
