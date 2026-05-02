import { describe, it, before, after, beforeEach, afterEach, snapshot } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dirname, 'fixtures')
const BIN = resolve(__dirname, '../bin/fin14.js')

async function withExitTrap(fn) {
  let exitCode
  const orig = process.exit
  process.exit = (code) => { exitCode = code ?? 0; throw new Error('EXIT:' + exitCode) }
  let caught
  try { await fn() }
  catch (e) { if (!e.message?.startsWith('EXIT:')) caught = e }
  finally { process.exit = orig }
  if (caught) throw caught
  return exitCode ?? 0
}

function captureStdout() {
  let output = ''
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk) => { output += chunk; return true }
  const restore = () => { process.stdout.write = orig }
  return { output: () => output, restore }
}

function runCli(args) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => stdout += d)
    proc.stderr.on('data', d => stderr += d)
    proc.on('close', exitCode => resolve({ exitCode, stdout, stderr }))
  })
}

import { formatBytes, statusSymbol, formatCutCandidate, formatGroupLine, formatWarning, separator } from '../commands/format.js'

describe('format', () => {
  it('formatBytes: 0 → —', () => assert.equal(formatBytes(0), '—'))
  it('formatBytes: 9200 → 9.2 kB', () => assert.equal(formatBytes(9200), '9.2 kB'))
  it('formatBytes: 14000 → 14.0 kB', () => assert.equal(formatBytes(14000), '14.0 kB'))
  it('statusSymbol: fail no TTY → ✗', () => assert.equal(statusSymbol('fail', false), '✗'))
  it('statusSymbol: pass no TTY → ✓', () => assert.equal(statusSymbol('pass', false), '✓'))
  it('statusSymbol: warn no TTY → ⚠', () => assert.equal(statusSymbol('warn', false), '⚠'))
  it('statusSymbol: pass TTY → contains ✓', () => assert.ok(statusSymbol('pass', true).includes('✓')))
  it('formatCutCandidate: image hint contains lazy', () => {
    const out = formatCutCandidate({ displayPath: 'hero.jpg', bytes: 9100, type: 'image' }, false)
    assert.ok(out.includes('lazy'))
  })
  it('formatCutCandidate: css hint contains purge', () => {
    const out = formatCutCandidate({ displayPath: 'style.css', bytes: 2400, type: 'css' }, false)
    assert.ok(out.includes('purge'))
  })
  it('formatGroupLine: empty → — line', () => {
    assert.ok(formatGroupLine('JS', [], false).includes('—'))
  })
  it('formatGroupLine: single resource → label + bytes + path', () => {
    const out = formatGroupLine('HTML', [{ displayPath: 'index.html', bytes: 3800, type: 'html' }], false)
    assert.ok(out.includes('HTML'))
    assert.ok(out.includes('index.html'))
    assert.ok(out.includes('3.8 kB'))
  })
})

import { runDefault } from '../commands/default.js'

describe('default command', () => {
  it('pass-site exits 0', async () => {
    const code = await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'pass-site')], flags: { config: null, verbose: false, force: false, strict: false, build: false } }))
    assert.equal(code, 0)
  })

  it('fail-site exits 1 without --force', async () => {
    const code = await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'fail-site')], flags: { config: null, verbose: false, force: false, strict: false, build: false } }))
    assert.equal(code, 1)
  })

  it('fail-site exits 0 with --force', async () => {
    const code = await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'fail-site')], flags: { config: null, verbose: false, force: true, strict: false, build: false } }))
    assert.equal(code, 0)
  })

  it('fail-site output contains ✗ and cut candidate', async () => {
    const cap = captureStdout()
    await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'fail-site')], flags: { config: null, verbose: false, force: true, strict: false, build: false } }))
    cap.restore()
    assert.ok(cap.output().includes('✗'))
    assert.ok(cap.output().includes('→'))
  })

  it('warn-site exits 0 without --strict', async () => {
    const code = await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'warn-site')], flags: { config: null, verbose: false, force: false, strict: false, build: false } }))
    assert.equal(code, 0)
  })

  it('warn-site exits 1 with --strict (E13)', async () => {
    const code = await withExitTrap(() => runDefault({ args: [resolve(FIXTURES, 'warn-site')], flags: { config: null, verbose: false, force: false, strict: true, build: false } }))
    assert.equal(code, 1)
  })

  it('nonexistent dir exits 1', async () => {
    const code = await withExitTrap(() => runDefault({ args: ['/nonexistent/path/that/does/not/exist'], flags: { config: null, verbose: false, force: false, strict: false, build: false } }))
    assert.equal(code, 1)
  })
})

import { runAudit } from '../commands/audit.js'

describe('audit command', () => {
  it('no args exits 1', async () => {
    const code = await withExitTrap(() => runAudit({ args: [], flags: { config: null, verbose: false, force: false, strict: false, all: false } }))
    assert.equal(code, 1)
  })

  it('nonexistent file exits 1', async () => {
    const code = await withExitTrap(() => runAudit({ args: ['/nonexistent/page.html'], flags: { config: null, verbose: false, force: false, strict: false, all: false } }))
    assert.equal(code, 1)
  })

  it('pass-site/index.html exits 0 and prints audit header', async () => {
    const cap = captureStdout()
    const code = await withExitTrap(() => runAudit({ args: [resolve(FIXTURES, 'pass-site/index.html')], flags: { config: null, verbose: false, force: false, strict: false, all: false } }))
    cap.restore()
    assert.equal(code, 0)
    assert.ok(cap.output().includes('audit'))
  })

  it('fail-site/index.html exits 1 and output contains ✗', async () => {
    const cap = captureStdout()
    const code = await withExitTrap(() => runAudit({ args: [resolve(FIXTURES, 'fail-site/index.html')], flags: { config: null, verbose: false, force: false, strict: false, all: false } }))
    cap.restore()
    assert.equal(code, 1)
    assert.ok(cap.output().includes('✗'))
  })

  it('--all pass-site exits 0', async () => {
    const code = await withExitTrap(() => runAudit({ args: [resolve(FIXTURES, 'pass-site')], flags: { config: null, verbose: false, force: false, strict: false, all: true } }))
    assert.equal(code, 0)
  })

  it('--all fail-site exits 1', async () => {
    const code = await withExitTrap(() => runAudit({ args: [resolve(FIXTURES, 'fail-site')], flags: { config: null, verbose: false, force: false, strict: false, all: true } }))
    assert.equal(code, 1)
  })
})

describe('--verbose flag', () => {
  it('--verbose on warn-site shows E13 warning in output', async () => {
    const { stdout } = await runCli(['--verbose', resolve(FIXTURES, 'warn-site')])
    assert.ok(stdout.includes('E13'), 'verbose output should contain E13 code')
  })
})

describe('--build flag', () => {
  let tmpDir

  it('--build success: runs build_command, then measures', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fin14-build-'))
    const passSite = resolve(FIXTURES, 'pass-site')
    await writeFile(join(tmpDir, 'fin14.toml'),
      `[project]\noutput_dir = "${passSite}"\nbuild_command = "echo build-ok"\n`)

    const { exitCode } = await runCli(['--config', join(tmpDir, 'fin14.toml'), '--build'])
    await rm(tmpDir, { recursive: true, force: true })
    assert.equal(exitCode, 0)
  })

  it('--build failure with existing outputDir: continues with stale warning, exits 0 without --strict', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fin14-build-fail-'))
    const passSite = resolve(FIXTURES, 'pass-site')
    await writeFile(join(tmpDir, 'fin14.toml'),
      `[project]\noutput_dir = "${passSite}"\nbuild_command = "exit 1"\n`)

    const { exitCode } = await runCli(['--config', join(tmpDir, 'fin14.toml'), '--build'])
    await rm(tmpDir, { recursive: true, force: true })
    assert.equal(exitCode, 0)
  })

  it('--build failure + --strict: E19 siteWarning causes exit 1', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fin14-build-strict-'))
    const passSite = resolve(FIXTURES, 'pass-site')
    await writeFile(join(tmpDir, 'fin14.toml'),
      `[project]\noutput_dir = "${passSite}"\nbuild_command = "exit 1"\n`)

    const { exitCode } = await runCli(['--config', join(tmpDir, 'fin14.toml'), '--build', '--strict'])
    await rm(tmpDir, { recursive: true, force: true })
    assert.equal(exitCode, 1)
  })
})

describe('E14 external resource strict behavior', () => {
  let server, externalBaseUrl, extTmpDir

  before(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/css' })
      res.end('body{color:blue}')
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    externalBaseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(() => new Promise(r => server.close(r)))

  beforeEach(async () => {
    extTmpDir = await mkdtemp(join(tmpdir(), 'fin14-ext-'))
    await writeFile(join(extTmpDir, 'index.html'),
      `<!DOCTYPE html><html><head><link rel="stylesheet" href="${externalBaseUrl}/style.css"></head><body>test</body></html>`)
  })

  afterEach(async () => {
    await rm(extTmpDir, { recursive: true, force: true })
  })

  it('E14: page with external resource exits 0 without --strict', async () => {
    const { exitCode } = await runCli([extTmpDir])
    assert.equal(exitCode, 0)
  })

  it('E14: page with external resource exits 1 with --strict', async () => {
    const { exitCode } = await runCli(['--strict', extTmpDir])
    assert.equal(exitCode, 1)
  })
})

describe('dev command invalid flags', () => {
  it('dev --force exits 1 with error message', async () => {
    const { exitCode, stderr } = await runCli(['dev', '--force'])
    assert.equal(exitCode, 1)
    assert.ok(stderr.includes('--force'))
  })

  it('dev --strict exits 1 with error message', async () => {
    const { exitCode, stderr } = await runCli(['dev', '--strict'])
    assert.equal(exitCode, 1)
    assert.ok(stderr.includes('--strict'))
  })

  it('dev --build exits 1 with error message', async () => {
    const { exitCode, stderr } = await runCli(['dev', '--build'])
    assert.equal(exitCode, 1)
    assert.ok(stderr.includes('--build'))
  })
})

describe('output snapshots', () => {
  it('default command: pass-site summary line format', async (t) => {
    const { stdout } = await runCli([resolve(FIXTURES, 'pass-site')])
    t.assert.snapshot(stdout)
  })

  it('audit command: pass-site audit block format', async (t) => {
    const { stdout } = await runCli(['audit', resolve(FIXTURES, 'pass-site', 'index.html')])
    t.assert.snapshot(stdout)
  })

  it('audit command: fail-site audit block format (with cut candidates)', async (t) => {
    const { stdout } = await runCli(['audit', '--force', resolve(FIXTURES, 'fail-site', 'index.html')])
    t.assert.snapshot(stdout)
  })
})

describe('bin smoke tests', () => {
  it('--help exits 0 and prints usage', async () => {
    const { exitCode, stdout } = await runCli(['--help'])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('fin14'))
  })

  it('--unknown-flag exits 1', async () => {
    const { exitCode, stderr } = await runCli(['--this-is-not-a-real-flag'])
    assert.equal(exitCode, 1)
    assert.ok(stderr.includes('unknown option'))
  })
})
