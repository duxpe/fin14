import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BIN = new URL('../bin/fin14.js', import.meta.url).pathname

test('dev command starts and prints report URL (line mode)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'fin14-dev-smoke-'))
  await writeFile(join(dir, 'index.html'), '<!DOCTYPE html><html><body>hi</body></html>')

  const proc = spawn(process.execPath, [BIN, 'dev', dir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })

  let stdout = ''
  proc.stdout.on('data', d => { stdout += d.toString() })

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout waiting for URL')), 4000)
    const interval = setInterval(() => {
      if (stdout.includes('http://localhost:')) {
        clearTimeout(timeout)
        clearInterval(interval)
        resolve()
      }
    }, 100)
    proc.on('error', reject)
    proc.on('close', (code) => {
      clearTimeout(timeout)
      clearInterval(interval)
      if (!stdout.includes('http://localhost:')) reject(new Error('process exited before printing URL, code: ' + code))
    })
  })

  assert.ok(stdout.includes('http://localhost:'), 'stdout contains report URL')

  proc.kill('SIGTERM')
  await new Promise(resolve => proc.on('close', resolve))
  await rm(dir, { recursive: true, force: true })
})

test('dev command rejects --force flag', async (t) => {
  const proc = spawn(process.execPath, [BIN, 'dev', '--force'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const [code, stderr] = await new Promise(resolve => {
    let err = ''
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('close', code => resolve([code, err]))
  })
  assert.strictEqual(code, 1)
  assert.ok(stderr.includes('--force'))
})
