import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toJsonReport, githubAnnotations, diffBaseline, SCHEMA_VERSION } from '../commands/reporters.js'

function makeSummary() {
  return {
    outputDir: 'dist',
    generatedAt: '2026-01-01T00:00:00.000Z',
    pages: 2,
    pass: 1,
    warn: 0,
    fail: 1,
    totalBytes: 27400,
    topAssets: [
      { key: '/abs/big.jpg', path: '/abs/big.jpg', group: 'images', type: 'image', displayPath: 'big.jpg', bytes: 18400, external: false, inline: false },
    ],
    siteWarnings: [],
    results: [
      {
        file: 'index.html', status: 'pass', totalBytes: 9000, limitBytes: 14000, overBudget: false, unknownBudget: false,
        warnings: [], cutCandidates: [], skippedResources: [],
        resources: [{ key: '/abs/index.html', path: '/abs/index.html', group: 'html', type: 'html', displayPath: 'index.html', bytes: 9000, external: false, inline: true }],
      },
      {
        file: 'gallery/index.html', status: 'fail', totalBytes: 18400, limitBytes: 14000, overBudget: true, unknownBudget: false,
        warnings: [{ code: 'E14', message: 'external resource counted: cdn.example.com/x.css', strictFailure: true }],
        cutCandidates: [{ key: '/abs/big.jpg', path: '/abs/big.jpg', group: 'images', type: 'image', displayPath: 'big.jpg', bytes: 18400, external: false, inline: false }],
        skippedResources: [],
        resources: [{ key: '/abs/big.jpg', path: '/abs/big.jpg', group: 'images', type: 'image', displayPath: 'big.jpg', bytes: 18400, external: false, inline: false }],
      },
    ],
  }
}

describe('toJsonReport', () => {
  it('has schemaVersion and round-trips through JSON', () => {
    const report = toJsonReport(makeSummary())
    assert.equal(report.schemaVersion, SCHEMA_VERSION)
    const parsed = JSON.parse(JSON.stringify(report))
    assert.equal(parsed.pages, 2)
    assert.equal(parsed.results.length, 2)
  })

  it('strips absolute paths from resources, keeps displayPath', () => {
    const report = toJsonReport(makeSummary())
    const res = report.results[0].resources[0]
    assert.equal(res.key, undefined)
    assert.equal(res.path, undefined)
    assert.equal(res.displayPath, 'index.html')
    assert.equal(report.topAssets[0].path, undefined)
  })

  it('embeds baseline when provided', () => {
    const report = toJsonReport(makeSummary(), { pages: [], added: [], removed: [] })
    assert.deepEqual(report.baseline, { pages: [], added: [], removed: [] })
  })

  it('defaults ignore fields to 0 / [] when absent', () => {
    const report = toJsonReport(makeSummary())
    assert.equal(report.results[0].ignoredBytes, 0)
    assert.deepEqual(report.results[0].ignoredResources, [])
  })

  it('serializes ignoredBytes and ignoredResources when present', () => {
    const summary = makeSummary()
    summary.results[0].ignoredBytes = 195800
    summary.results[0].ignoredResources = [
      { key: '/abs/_next/chunks/a.js', path: '/abs/_next/chunks/a.js', group: 'js', type: 'js', displayPath: '_next/static/chunks/a.js', bytes: 195800, external: false, inline: false },
    ]
    const report = toJsonReport(summary)
    assert.equal(report.results[0].ignoredBytes, 195800)
    assert.equal(report.results[0].ignoredResources.length, 1)
    assert.equal(report.results[0].ignoredResources[0].displayPath, '_next/static/chunks/a.js')
    assert.equal(report.results[0].ignoredResources[0].key, undefined)
  })
})

describe('githubAnnotations', () => {
  it('emits ::error for over-budget pages with kB overage', () => {
    const lines = githubAnnotations(makeSummary(), 'dist')
    const err = lines.find(l => l.startsWith('::error'))
    assert.ok(err.includes('file=dist/gallery/index.html'))
    assert.ok(err.includes('over budget'))
    assert.ok(err.includes('4.4 kB'))
  })

  it('emits ::warning for strict warnings', () => {
    const lines = githubAnnotations(makeSummary(), 'dist')
    assert.ok(lines.some(l => l.startsWith('::warning') && l.includes('E14') === false && l.includes('external resource')))
  })

  it('respects excluded warning codes', () => {
    const lines = githubAnnotations(makeSummary(), 'dist', new Set(['E14']))
    assert.ok(!lines.some(l => l.startsWith('::warning')))
    assert.ok(lines.some(l => l.startsWith('::error')))
  })
})

describe('diffBaseline', () => {
  const baseline = {
    results: [
      { file: 'index.html', totalBytes: 9000 },
      { file: 'gallery/index.html', totalBytes: 12000 },
      { file: 'old.html', totalBytes: 5000 },
    ],
  }

  it('reports deltas above the threshold, filters tiny ones', () => {
    const diff = diffBaseline(makeSummary(), baseline)
    assert.equal(diff.pages.length, 1)
    assert.equal(diff.pages[0].file, 'gallery/index.html')
    assert.equal(diff.pages[0].delta, 6400)
  })

  it('tracks added and removed pages', () => {
    const diff = diffBaseline(makeSummary(), baseline)
    assert.deepEqual(diff.added, [])
    assert.deepEqual(diff.removed, ['old.html'])
  })

  it('tolerates a baseline with no results', () => {
    const diff = diffBaseline(makeSummary(), {})
    assert.deepEqual(diff.pages, [])
    assert.deepEqual(diff.added, ['gallery/index.html', 'index.html'])
  })
})
