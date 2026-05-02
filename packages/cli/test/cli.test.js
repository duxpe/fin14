import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

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
