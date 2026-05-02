import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig, measurePage, measureSite, summarize } from '../src/index.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const fixtureDir = resolve(__dirname, 'fixtures/simple')

async function makeConfig() {
  const config = await loadConfig({})
  config.project.output_dir = fixtureDir
  return config
}

test('measurePage: index.html passes with resources', async () => {
  const config = await makeConfig()
  const result = await measurePage(resolve(fixtureDir, 'index.html'), config)
  assert.equal(result.status, 'pass')
  assert.ok(result.totalBytes > 0)
  assert.ok(result.resources.some(r => r.type === 'html'))
})

test('measurePage: index.html not over budget', async () => {
  const config = await makeConfig()
  const result = await measurePage(resolve(fixtureDir, 'index.html'), config)
  assert.equal(result.overBudget, false)
})

test('measureSite: fixture dir returns SiteSummary with 2 pages all pass', async () => {
  const config = await makeConfig()
  const summary = await measureSite(fixtureDir, config)
  assert.equal(summary.pages, 2)
  assert.equal(summary.pass, 2)
  assert.equal(summary.fail, 0)
})

test('summarize: correct counts and topAssets populated', async () => {
  const config = await makeConfig()
  const r1 = await measurePage(resolve(fixtureDir, 'index.html'), config)
  const r2 = await measurePage(resolve(fixtureDir, 'about.html'), config)
  const summary = summarize([r1, r2], fixtureDir)
  assert.equal(summary.pages, 2)
  assert.equal(summary.pass + summary.warn + summary.fail, 2)
  assert.ok(Array.isArray(summary.topAssets))
  assert.ok(summary.topAssets.length > 0)
})

test('SiteSummary has valid generatedAt ISO string and correct outputDir', async () => {
  const config = await makeConfig()
  const summary = await measureSite(fixtureDir, config)
  assert.equal(summary.outputDir, fixtureDir)
  assert.ok(!isNaN(Date.parse(summary.generatedAt)))
})

test('measurePage result has file as relative path', async () => {
  const config = await makeConfig()
  const result = await measurePage(resolve(fixtureDir, 'index.html'), config)
  assert.equal(result.file, 'index.html')
})

const overBudgetDir = resolve(__dirname, 'fixtures/over-budget')
const nearBudgetDir = resolve(__dirname, 'fixtures/near-budget')
const withAssetsDir = resolve(__dirname, 'fixtures/with-assets')

test('over-budget fixture: measurePage returns overBudget=true and status=fail', async () => {
  const config = await loadConfig({})
  config.project.output_dir = overBudgetDir
  const result = await measurePage(resolve(overBudgetDir, 'index.html'), config)
  assert.equal(result.overBudget, true)
  assert.equal(result.status, 'fail')
  assert.ok(result.totalBytes > 14000)
})

test('near-budget fixture: measurePage returns E13 warning with strictFailure=true', async () => {
  const config = await loadConfig({})
  config.project.output_dir = nearBudgetDir
  const result = await measurePage(resolve(nearBudgetDir, 'index.html'), config)
  assert.equal(result.overBudget, false)
  const e13 = result.warnings.find(w => w.code === 'E13')
  assert.ok(e13, 'E13 warning should be present')
  assert.equal(e13.strictFailure, true)
  assert.ok(result.totalBytes > 12200)
  assert.ok(result.totalBytes <= 14000)
})

test('with-assets fixture: measurePage collects css, js, image refs from linked files', async () => {
  const config = await loadConfig({})
  config.project.output_dir = withAssetsDir
  const result = await measurePage(resolve(withAssetsDir, 'index.html'), config)
  assert.ok(result.resources.some(r => r.type === 'css'), 'should have CSS ref')
  assert.ok(result.resources.some(r => r.type === 'js'), 'should have JS ref')
  assert.ok(result.resources.some(r => r.type === 'image'), 'should have image ref')
  assert.ok(result.totalBytes > 0)
})

test('measureSite: empty dir returns SiteSummary with pages=0', async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), 'fin14-empty-'))
  try {
    const config = await loadConfig({})
    config.project.output_dir = emptyDir
    const summary = await measureSite(emptyDir, config)
    assert.equal(summary.pages, 0)
    assert.equal(summary.pass, 0)
    assert.equal(summary.fail, 0)
  } finally {
    await rm(emptyDir, { recursive: true, force: true })
  }
})

test('SiteSummary shape contract: all required fields present with correct types', async () => {
  const config = await loadConfig({})
  config.project.output_dir = fixtureDir
  const summary = await measureSite(fixtureDir, config)

  assert.equal(typeof summary.outputDir, 'string')
  assert.equal(typeof summary.generatedAt, 'string')
  assert.ok(!isNaN(Date.parse(summary.generatedAt)), 'generatedAt must be valid ISO date')
  assert.equal(typeof summary.pages, 'number')
  assert.equal(typeof summary.pass, 'number')
  assert.equal(typeof summary.warn, 'number')
  assert.equal(typeof summary.fail, 'number')
  assert.equal(typeof summary.totalBytes, 'number')
  assert.ok(Array.isArray(summary.topAssets), 'topAssets must be array')
  assert.ok(Array.isArray(summary.results), 'results must be array')
  assert.equal(summary.pass + summary.warn + summary.fail, summary.pages)

  if (summary.topAssets.length > 0) {
    const r = summary.topAssets[0]
    assert.ok(['html', 'css', 'js', 'image', 'font'].includes(r.type), `invalid type: ${r.type}`)
    assert.ok(['html', 'css', 'js', 'images', 'external'].includes(r.group), `invalid group: ${r.group}`)
    assert.equal(typeof r.bytes, 'number')
    assert.equal(typeof r.displayPath, 'string')
    assert.equal(typeof r.external, 'boolean')
    assert.equal(typeof r.inline, 'boolean')
  }

  if (summary.results.length > 0) {
    const p = summary.results[0]
    assert.equal(typeof p.file, 'string')
    assert.equal(typeof p.totalBytes, 'number')
    assert.equal(typeof p.limitBytes, 'number')
    assert.ok(['pass', 'warn', 'fail'].includes(p.status))
    assert.equal(typeof p.overBudget, 'boolean')
    assert.equal(typeof p.unknownBudget, 'boolean')
    assert.ok(Array.isArray(p.resources))
    assert.ok(Array.isArray(p.skippedResources))
    assert.ok(Array.isArray(p.warnings))
    assert.ok(Array.isArray(p.cutCandidates))
  }
})
