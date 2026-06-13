import { describe, it, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  IGNORE_PRESETS,
  applyIgnore,
  applyIgnoreToPage,
  applyIgnoreToSummary,
  loadConfig,
  resolveIgnoreGlobs,
  summarize,
} from '../src/index.js'

const config = { budget: { default: 14000 } }

function res(displayPath, bytes, group = 'js') {
  return { key: displayPath, path: displayPath, displayPath, group, type: group, bytes, external: false, inline: false }
}

describe('resolveIgnoreGlobs', () => {
  it('combines explicit ignore globs with preset globs', () => {
    const c = { budget: { ignore: ['a/**'], ignore_presets: ['nextjs'] } }
    assert.deepEqual(resolveIgnoreGlobs(c), ['a/**', ...IGNORE_PRESETS.nextjs.globs])
  })

  it('empty when nothing configured', () => {
    assert.deepEqual(resolveIgnoreGlobs({ budget: {} }), [])
  })

  it('nextjs preset targets _next chunks JS only', () => {
    assert.deepEqual(IGNORE_PRESETS.nextjs.globs, ['_next/static/chunks/**.js'])
  })
})

describe('applyIgnore', () => {
  const resources = [
    res('index.html', 5000, 'html'),
    res('_next/static/chunks/a.js', 70000),
    res('_next/static/chunks/b.js', 30000),
    res('_next/static/chunks/x.css', 1500, 'css'),
  ]

  it('splits resources by glob on displayPath', () => {
    const { counted, ignored, countedBytes, ignoredBytes } = applyIgnore(resources, ['_next/static/chunks/**.js'])
    assert.deepEqual(counted.map(r => r.displayPath), ['index.html', '_next/static/chunks/x.css'])
    assert.deepEqual(ignored.map(r => r.displayPath), ['_next/static/chunks/a.js', '_next/static/chunks/b.js'])
    assert.equal(countedBytes, 6500)
    assert.equal(ignoredBytes, 100000)
  })

  it('no globs → everything counted, nothing ignored', () => {
    const { counted, ignored, ignoredBytes } = applyIgnore(resources, [])
    assert.equal(counted.length, 4)
    assert.equal(ignored.length, 0)
    assert.equal(ignoredBytes, 0)
  })
})

describe('applyIgnoreToPage', () => {
  const page = {
    file: 'index.html',
    totalBytes: 106500,
    limitBytes: 14000,
    status: 'fail',
    overBudget: true,
    warnings: [{ code: 'E14', message: 'external resource counted: x', strictFailure: true }],
    cutCandidates: [],
    resources: [
      res('index.html', 5000, 'html'),
      res('_next/static/chunks/a.js', 70000),
      res('_next/static/chunks/b.js', 30000),
    ],
  }

  it('recomputes total and flips fail → pass when JS ignored', () => {
    const out = applyIgnoreToPage(page, ['_next/static/chunks/**.js'], config)
    assert.equal(out.totalBytes, 5000)
    assert.equal(out.overBudget, false)
    assert.equal(out.status, 'pass')
    assert.equal(out.ignoredBytes, 100000)
    assert.equal(out.ignoredResources.length, 2)
    assert.equal(out.resources.length, 1)
  })

  it('drops E14 when the external resource is ignored', () => {
    const externalPage = {
      ...page,
      warnings: [],
      resources: [res('index.html', 5000, 'html'), { ...res('https://cdn/x.js', 9000), external: true, displayPath: 'cdn/x.js' }],
      totalBytes: 14000,
      overBudget: false,
    }
    const withExternal = applyIgnoreToPage(externalPage, [], config)
    assert.ok(withExternal.warnings.some(w => w.code === 'E14'))
    const ignored = applyIgnoreToPage(externalPage, ['cdn/**'], config)
    assert.ok(!ignored.warnings.some(w => w.code === 'E14'))
  })

  it('adds ignoredBytes:0 when nothing matches', () => {
    const out = applyIgnoreToPage(page, [], config)
    assert.equal(out.ignoredBytes, 0)
    assert.deepEqual(out.ignoredResources, [])
  })
})

describe('applyIgnoreToSummary', () => {
  it('recomputes pass/fail counts across pages', () => {
    const mk = file => ({
      file,
      totalBytes: 75000,
      limitBytes: 14000,
      status: 'fail',
      overBudget: true,
      warnings: [],
      cutCandidates: [],
      resources: [res('index.html', 5000, 'html'), res('_next/static/chunks/a.js', 70000)],
    })
    const summary = summarize([mk('index.html'), mk('about.html')], 'out', [])
    assert.equal(summary.fail, 2)
    const out = applyIgnoreToSummary(summary, ['_next/static/chunks/**.js'], config)
    assert.equal(out.pass, 2)
    assert.equal(out.fail, 0)
  })
})

describe('config: ignore validation', () => {
  let dir
  async function load(toml) {
    dir = await mkdtemp(join(tmpdir(), 'fin14-ignore-'))
    const path = join(dir, 'fin14.toml')
    await writeFile(path, toml)
    return loadConfig({ config: path })
  }

  it('accepts ignore globs and a known preset', async () => {
    const c = await load('[budget]\nignore = ["foo/**"]\nignore_presets = ["nextjs"]\n')
    assert.deepEqual(c.budget.ignore, ['foo/**'])
    assert.deepEqual(c.budget.ignore_presets, ['nextjs'])
  })

  it('rejects an unknown preset (exit-2 config error)', async () => {
    await assert.rejects(() => load('[budget]\nignore_presets = ["angular"]\n'), /unknown budget.ignore_presets value 'angular'/)
  })

  it('defaults to empty arrays', async () => {
    const c = await load('[budget]\ndefault = "14kb"\n')
    assert.deepEqual(c.budget.ignore, [])
    assert.deepEqual(c.budget.ignore_presets, [])
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})
