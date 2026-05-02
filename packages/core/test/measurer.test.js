import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compress } from '../src/compress.js'
import { measure } from '../src/budget/measurer.js'

const config = {
  budget: { compression: 'gzip', compression_level: 6 },
  network: { timeout_ms: 1000, max_redirects: 0 },
}

function makeRef(overrides) {
  return {
    key: overrides.path ?? 'key',
    type: 'css',
    group: 'css',
    path: overrides.path ?? '/tmp/file.css',
    displayPath: 'file.css',
    external: false,
    inline: false,
    ...overrides,
  }
}

describe('measurer', () => {
  let dir

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fin14-measurer-'))
  })

  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('inline ref compresses inlineContent', async () => {
    const content = Buffer.from('body { margin: 0; }')
    const ref = makeRef({
      key: 'inline-style:0',
      path: join(dir, 'index.html'),
      displayPath: 'index.html',
      inline: true,
      inlineContent: content,
    })
    const { results, warnings, unknownBudget } = await measure([ref], config)
    assert.equal(warnings.length, 0)
    assert.equal(unknownBudget, false)
    assert.equal(results.length, 1)
    assert.equal(results[0].bytes, compress(content, config.budget))
    assert.ok(!('inlineContent' in results[0]))
  })

  it('local CSS file returns bytes > 0', async () => {
    const file = join(dir, 'style.css')
    await writeFile(file, 'a { color: blue; }')
    const ref = makeRef({ path: file, displayPath: 'style.css', type: 'css' })
    const { results, warnings } = await measure([ref], config)
    assert.equal(warnings.length, 0)
    assert.equal(results.length, 1)
    assert.ok(results[0].bytes > 0)
  })

  it('missing CSS file emits E06 and skips ref', async () => {
    const ref = makeRef({ path: join(dir, 'missing.css'), displayPath: 'missing.css', type: 'css' })
    const { results, warnings } = await measure([ref], config)
    assert.equal(results.length, 0)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].code, 'E06')
    assert.equal(warnings[0].strictFailure, false)
  })

  it('missing JS file emits E07 and skips ref', async () => {
    const ref = makeRef({ path: join(dir, 'missing.js'), displayPath: 'missing.js', type: 'js', group: 'js' })
    const { results, warnings } = await measure([ref], config)
    assert.equal(results.length, 0)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].code, 'E07')
  })

  it('missing image file emits E08 and skips ref', async () => {
    const ref = makeRef({ path: join(dir, 'missing.png'), displayPath: 'missing.png', type: 'image', group: 'images' })
    const { results, warnings } = await measure([ref], config)
    assert.equal(results.length, 0)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].code, 'E08')
  })

  it('unknownBudget false when no external failures', async () => {
    const file = join(dir, 'good.css')
    await writeFile(file, 'p { font-size: 1rem; }')
    const ref = makeRef({ path: file, displayPath: 'good.css' })
    const { unknownBudget } = await measure([ref], config)
    assert.equal(unknownBudget, false)
  })

  it('external fetch failure emits E09 + E19 and sets unknownBudget', async () => {
    const ref = makeRef({
      key: 'http://localhost:1/fail.css',
      path: 'http://localhost:1/fail.css',
      displayPath: 'localhost/fail.css',
      type: 'css',
      group: 'external',
      external: true,
    })
    const { results, warnings, unknownBudget } = await measure([ref], config)
    assert.equal(results.length, 0)
    assert.equal(unknownBudget, true)
    const codes = warnings.map(w => w.code)
    assert.ok(codes.includes('E09'))
    assert.ok(codes.includes('E19'))
    const e19 = warnings.find(w => w.code === 'E19')
    assert.equal(e19.strictFailure, true)
  })
})
