import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
