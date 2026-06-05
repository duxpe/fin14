import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const CLI_PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORE_PKG = resolve(CLI_PKG, '..', 'core')
let cliTarball, coreTarball, installDir

before(() => {
  const coreResult = execSync('npm pack', { cwd: CORE_PKG, encoding: 'utf8' })
  coreTarball = resolve(CORE_PKG, coreResult.trim().split('\n').at(-1))

  const cliResult = execSync('npm pack', { cwd: CLI_PKG, encoding: 'utf8' })
  cliTarball = resolve(CLI_PKG, cliResult.trim().split('\n').at(-1))

  installDir = mkdtempSync(join(tmpdir(), 'fin14-smoke-'))

  execSync(`npm install --prefix ${installDir} ${coreTarball} ${cliTarball}`, {
    encoding: 'utf8',
    stdio: 'pipe',
  })
})

after(() => {
  if (cliTarball) try { rmSync(cliTarball) } catch {}
  if (coreTarball) try { rmSync(coreTarball) } catch {}
  if (installDir) rmSync(installDir, { recursive: true, force: true })
})

const bin = () => join(installDir, 'node_modules', '.bin', 'fin14')

describe('npm pack smoke', () => {
  it('packed bin: --help exits 0 and prints usage', () => {
    const r = spawnSync(bin(), ['--help'])
    assert.equal(r.status, 0)
    assert.ok(r.stdout.toString().includes('fin14'))
  })

  it('packed bin: unknown flag exits 2', () => {
    const r = spawnSync(bin(), ['--not-a-real-flag'])
    assert.equal(r.status, 2)
  })

  it('packed bin: measures tiny site, exits 0', () => {
    const siteDir = mkdtempSync(join(tmpdir(), 'fin14-site-'))
    writeFileSync(join(siteDir, 'index.html'), '<html><body>hello</body></html>')
    const r = spawnSync(bin(), [siteDir])
    rmSync(siteDir, { recursive: true, force: true })
    assert.equal(r.status, 0)
  })

  it('npm pack --dry-run: core package excludes test/', () => {
    const corePkg = resolve(CLI_PKG, '..', 'core')
    const r = execSync('npm pack --dry-run 2>&1', { cwd: corePkg, encoding: 'utf8' })
    assert.ok(r.includes('src/'))
    assert.ok(!r.includes('test/'))
  })

  it('npm pack --dry-run: CLI package includes bin and excludes test/', () => {
    const r = execSync('npm pack --dry-run 2>&1', { cwd: CLI_PKG, encoding: 'utf8' })
    assert.ok(r.includes('bin/fin14.js'))
    assert.ok(r.includes('commands/'))
    assert.ok(!r.includes('test/'))
  })
})
