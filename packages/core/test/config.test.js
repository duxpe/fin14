import { describe, it, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_CONFIG, loadConfig } from '../src/index.js'

// ── E2E ──────────────────────────────────────────────────────────────────────

describe('e2e: load full fin14.toml', () => {
  let dir

  it('loads all sections and merges with defaults', async () => {
    dir = await mkdtemp(join(tmpdir(), 'fin14-e2e-'))
    const toml = `
[project]
output_dir = "dist"
build_command = "npm run build"

[budget]
default = "16kb"
compression = "brotli"
compression_level = 5

[network]
timeout_ms = 8000
max_redirects = 3

[viewport]
default = "desktop"
`
    await writeFile(join(dir, 'fin14.toml'), toml)
    const config = await loadConfig({ config: join(dir, 'fin14.toml') })

    assert.equal(config.project.output_dir, 'dist')
    assert.equal(config.project.build_command, 'npm run build')
    assert.equal(config.budget.default, 16000)
    assert.equal(config.budget.compression, 'brotli')
    assert.equal(config.budget.compression_level, 5)
    assert.equal(config.network.timeout_ms, 8000)
    assert.equal(config.network.max_redirects, 3)
    assert.equal(config.viewport.default, 'desktop')
    // defaults still present for untouched viewport presets
    assert.equal(config.viewport.mobile.width, DEFAULT_CONFIG.viewport.mobile.width)
    assert.equal(config.viewport.desktop.width, DEFAULT_CONFIG.viewport.desktop.width)
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

describe('e2e: empty config uses all defaults', () => {
  let dir

  it('all defaults intact when toml has no sections', async () => {
    dir = await mkdtemp(join(tmpdir(), 'fin14-defaults-'))
    await writeFile(join(dir, 'fin14.toml'), '')
    const config = await loadConfig({ config: join(dir, 'fin14.toml') })

    assert.equal(config.project.output_dir, null)
    assert.equal(config.project.build_command, null)
    assert.equal(config.budget.default, DEFAULT_CONFIG.budget.default)
    assert.equal(config.budget.compression, DEFAULT_CONFIG.budget.compression)
    assert.equal(config.budget.compression_level, DEFAULT_CONFIG.budget.compression_level)
    assert.equal(config.budget.cut_candidate_min_bytes, DEFAULT_CONFIG.budget.cut_candidate_min_bytes)
    assert.equal(config.budget.baseline_min_delta_bytes, DEFAULT_CONFIG.budget.baseline_min_delta_bytes)
    assert.equal(config.network.timeout_ms, DEFAULT_CONFIG.network.timeout_ms)
    assert.equal(config.network.max_redirects, DEFAULT_CONFIG.network.max_redirects)
    assert.equal(config.viewport.default, DEFAULT_CONFIG.viewport.default)
    assert.equal(config.viewport.mobile.width, DEFAULT_CONFIG.viewport.mobile.width)
    assert.equal(config.viewport.mobile.height, DEFAULT_CONFIG.viewport.mobile.height)
    assert.equal(config.viewport.desktop.width, DEFAULT_CONFIG.viewport.desktop.width)
    assert.equal(config.viewport.desktop.height, DEFAULT_CONFIG.viewport.desktop.height)
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

// ── budget.default parsing ────────────────────────────────────────────────────

describe('budget.default parsing', () => {
  let dir

  async function budgetToml(value) {
    const toml = typeof value === 'string'
      ? `[budget]\ndefault = "${value}"\n`
      : `[budget]\ndefault = ${value}\n`
    const file = join(dir, 'fin14.toml')
    await writeFile(file, toml)
    return loadConfig({ config: file })
  }

  it('setup', async () => { dir = await mkdtemp(join(tmpdir(), 'fin14-budget-')) })

  it('"14kb" → 14000', async () => {
    const config = await budgetToml('14kb')
    assert.equal(config.budget.default, 14000)
  })

  it('"14.5KB" → 14500', async () => {
    const config = await budgetToml('14.5KB')
    assert.equal(config.budget.default, 14500)
  })

  it('integer 16000 → 16000', async () => {
    const config = await budgetToml(16000)
    assert.equal(config.budget.default, 16000)
  })

  it('float 14.1 → error', async () => {
    await assert.rejects(() => budgetToml(14.1), /expected integer/)
  })

  it('invalid string "big" → error', async () => {
    await assert.rejects(() => budgetToml('big'), /invalid value/)
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

// ── SSG auto-detection ────────────────────────────────────────────────────────

describe('SSG auto-detection', () => {
  let dir
  const originalCwd = process.cwd()

  it('setup', async () => {
    dir = await mkdtemp(join(tmpdir(), 'fin14-ssg-'))
  })

  it('astro.config.ts → "dist"', async () => {
    const ssgDir = await mkdtemp(join(tmpdir(), 'fin14-ssg-astro-'))
    await writeFile(join(ssgDir, 'astro.config.ts'), '')
    process.chdir(ssgDir)
    try {
      const config = await loadConfig({})
      assert.equal(config.project.output_dir, 'dist')
    } finally {
      process.chdir(originalCwd)
      await rm(ssgDir, { recursive: true, force: true })
    }
  })

  it('hugo.toml → "public"', async () => {
    const ssgDir = await mkdtemp(join(tmpdir(), 'fin14-ssg-hugo-'))
    await writeFile(join(ssgDir, 'hugo.toml'), '')
    process.chdir(ssgDir)
    try {
      const config = await loadConfig({})
      assert.equal(config.project.output_dir, 'public')
    } finally {
      process.chdir(originalCwd)
      await rm(ssgDir, { recursive: true, force: true })
    }
  })

  it('_config.yml → "_site"', async () => {
    const ssgDir = await mkdtemp(join(tmpdir(), 'fin14-ssg-jekyll-'))
    await writeFile(join(ssgDir, '_config.yml'), '')
    process.chdir(ssgDir)
    try {
      const config = await loadConfig({})
      assert.equal(config.project.output_dir, '_site')
    } finally {
      process.chdir(originalCwd)
      await rm(ssgDir, { recursive: true, force: true })
    }
  })

  it('no SSG files → null', async () => {
    const ssgDir = await mkdtemp(join(tmpdir(), 'fin14-ssg-empty-'))
    process.chdir(ssgDir)
    try {
      const config = await loadConfig({})
      assert.equal(config.project.output_dir, null)
    } finally {
      process.chdir(originalCwd)
      await rm(ssgDir, { recursive: true, force: true })
    }
  })

  it('options.outputDir beats SSG detection', async () => {
    const ssgDir = await mkdtemp(join(tmpdir(), 'fin14-ssg-override-'))
    await writeFile(join(ssgDir, 'astro.config.ts'), '')
    process.chdir(ssgDir)
    try {
      const config = await loadConfig({ outputDir: 'custom-out' })
      assert.equal(config.project.output_dir, 'custom-out')
    } finally {
      process.chdir(originalCwd)
      await rm(ssgDir, { recursive: true, force: true })
    }
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

// ── E03 / E04 error paths ─────────────────────────────────────────────────────

describe('E03/E04 error paths', () => {
  let dir

  it('setup', async () => { dir = await mkdtemp(join(tmpdir(), 'fin14-errors-')) })

  it('bad TOML syntax → E03', async () => {
    const file = join(dir, 'bad.toml')
    await writeFile(file, '[broken\n')
    await assert.rejects(() => loadConfig({ config: file }), /^Error: E03:/)
  })

  it('unknown top-level key → E04', async () => {
    const file = join(dir, 'unknown-key.toml')
    await writeFile(file, '[unknown_section]\nfoo = 1\n')
    await assert.rejects(() => loadConfig({ config: file }), /^Error: E04:/)
  })

  it('unknown sub-key budget.unknown → E04 mentioning budget.unknown', async () => {
    const file = join(dir, 'budget-unknown.toml')
    await writeFile(file, '[budget]\nunknown = 1\n')
    await assert.rejects(
      () => loadConfig({ config: file }),
      (err) => {
        assert.match(err.message, /^E04:/)
        assert.match(err.message, /budget\.unknown/)
        return true
      }
    )
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

// ── Type / range validation ───────────────────────────────────────────────────

describe('type and range validation', () => {
  let dir

  it('setup', async () => { dir = await mkdtemp(join(tmpdir(), 'fin14-validation-')) })

  it('compression_level = 11 → accepted', async () => {
    const file = join(dir, 'comp-level-11.toml')
    await writeFile(file, '[budget]\ncompression_level = 11\n')
    const config = await loadConfig({ config: file })
    assert.equal(config.budget.compression_level, 11)
  })

  it('compression_level = 0 → accepted', async () => {
    const file = join(dir, 'comp-level-0.toml')
    await writeFile(file, '[budget]\ncompression_level = 0\n')
    const config = await loadConfig({ config: file })
    assert.equal(config.budget.compression_level, 0)
  })

  it('compression_level = 12 → error', async () => {
    const file = join(dir, 'comp-level-12.toml')
    await writeFile(file, '[budget]\ncompression_level = 12\n')
    await assert.rejects(() => loadConfig({ config: file }), /compression_level/)
  })

  it('compression_level = -1 → error', async () => {
    const file = join(dir, 'comp-level-neg.toml')
    await writeFile(file, '[budget]\ncompression_level = -1\n')
    await assert.rejects(() => loadConfig({ config: file }), /compression_level/)
  })

  it('viewport.default = "tablet" → error', async () => {
    const file = join(dir, 'viewport.toml')
    await writeFile(file, '[viewport]\ndefault = "tablet"\n')
    await assert.rejects(() => loadConfig({ config: file }), /viewport\.default/)
  })

  it('baseline_min_delta_bytes = 0 → accepted', async () => {
    const file = join(dir, 'baseline-0.toml')
    await writeFile(file, '[budget]\nbaseline_min_delta_bytes = 0\n')
    const config = await loadConfig({ config: file })
    assert.equal(config.budget.baseline_min_delta_bytes, 0)
  })

  it('baseline_min_delta_bytes = 250 → accepted', async () => {
    const file = join(dir, 'baseline-250.toml')
    await writeFile(file, '[budget]\nbaseline_min_delta_bytes = 250\n')
    const config = await loadConfig({ config: file })
    assert.equal(config.budget.baseline_min_delta_bytes, 250)
  })

  it('baseline_min_delta_bytes = -1 → error', async () => {
    const file = join(dir, 'baseline-neg.toml')
    await writeFile(file, '[budget]\nbaseline_min_delta_bytes = -1\n')
    await assert.rejects(() => loadConfig({ config: file }), /baseline_min_delta_bytes/)
  })

  it('baseline_min_delta_bytes = 1.5 → error', async () => {
    const file = join(dir, 'baseline-float.toml')
    await writeFile(file, '[budget]\nbaseline_min_delta_bytes = 1.5\n')
    await assert.rejects(() => loadConfig({ config: file }), /baseline_min_delta_bytes/)
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})

// ── include / exclude / per-path budgets ──────────────────────────────────────

describe('include / exclude / budget.overrides', () => {
  let dir

  it('setup', async () => { dir = await mkdtemp(join(tmpdir(), 'fin14-globs-')) })

  it('defaults: empty arrays', async () => {
    const file = join(dir, 'empty.toml')
    await writeFile(file, '')
    const config = await loadConfig({ config: file })
    assert.deepEqual(config.project.include, [])
    assert.deepEqual(config.project.exclude, [])
    assert.deepEqual(config.budget.overrides, [])
  })

  it('parses project.include and project.exclude', async () => {
    const file = join(dir, 'globs.toml')
    await writeFile(file, '[project]\ninclude = ["blog/**"]\nexclude = ["404.html", "tags/**"]\n')
    const config = await loadConfig({ config: file })
    assert.deepEqual(config.project.include, ['blog/**'])
    assert.deepEqual(config.project.exclude, ['404.html', 'tags/**'])
  })

  it('parses budget.overrides with kB strings → bytes', async () => {
    const file = join(dir, 'overrides.toml')
    await writeFile(file, '[[budget.overrides]]\npath = "gallery/**"\nbudget = "20kb"\n')
    const config = await loadConfig({ config: file })
    assert.deepEqual(config.budget.overrides, [{ path: 'gallery/**', budget: 20000 }])
  })

  it('bad include type → E04', async () => {
    const file = join(dir, 'bad-include.toml')
    await writeFile(file, '[project]\ninclude = "blog/**"\n')
    await assert.rejects(() => loadConfig({ config: file }), /E04:.*project\.include/)
  })

  it('override missing path → E04', async () => {
    const file = join(dir, 'no-path.toml')
    await writeFile(file, '[[budget.overrides]]\nbudget = "20kb"\n')
    await assert.rejects(() => loadConfig({ config: file }), /E04:.*path/)
  })

  it('override bad budget value → E04', async () => {
    const file = join(dir, 'bad-budget.toml')
    await writeFile(file, '[[budget.overrides]]\npath = "x/**"\nbudget = "big"\n')
    await assert.rejects(() => loadConfig({ config: file }), /budget\.overrides\[0\]\.budget/)
  })

  it('unknown override key → E04', async () => {
    const file = join(dir, 'bad-key.toml')
    await writeFile(file, '[[budget.overrides]]\npath = "x/**"\nbudget = "20kb"\nlimit = 1\n')
    await assert.rejects(() => loadConfig({ config: file }), /E04:.*budget\.overrides\[0\]\.limit/)
  })

  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })
})
