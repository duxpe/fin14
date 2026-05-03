import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWatcher } from '../dev-server/watcher.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'fin14-watcher-'))
}

test('ignores initial scan', async (t) => {
  const dir = await makeTempDir()
  await fs.writeFile(path.join(dir, 'a.html'), '<html>')
  let called = false
  const w = createWatcher(dir, () => { called = true })
  await sleep(500)
  assert.strictEqual(called, false)
  await w.close()
  await fs.rm(dir, { recursive: true })
})

test('single file change triggers batch', async (t) => {
  const dir = await makeTempDir()
  let batches = []
  const w = createWatcher(dir, (paths) => batches.push(paths))
  await sleep(100)
  await fs.writeFile(path.join(dir, 'index.html'), '<html>')
  await sleep(450)
  assert.strictEqual(batches.length, 1)
  assert.ok(batches[0].some(p => p.includes('index.html')))
  await w.close()
  await fs.rm(dir, { recursive: true })
})

test('coalesces burst into one batch', async (t) => {
  const dir = await makeTempDir()
  let batches = []
  const w = createWatcher(dir, (paths) => batches.push(paths))
  await sleep(100)
  await fs.writeFile(path.join(dir, 'a.html'), 'a')
  await sleep(50)
  await fs.writeFile(path.join(dir, 'b.html'), 'b')
  await sleep(50)
  await fs.writeFile(path.join(dir, 'c.html'), 'c')
  await sleep(500)
  assert.strictEqual(batches.length, 1)
  assert.strictEqual(batches[0].length, 3)
  await w.close()
  await fs.rm(dir, { recursive: true })
})

test('ignores temp and OS files', async (t) => {
  const dir = await makeTempDir()
  let called = false
  const w = createWatcher(dir, () => { called = true })
  await sleep(100)
  await fs.writeFile(path.join(dir, 'file.tmp'), 'x')
  await fs.writeFile(path.join(dir, '.DS_Store'), 'x')
  await sleep(500)
  assert.strictEqual(called, false)
  await w.close()
  await fs.rm(dir, { recursive: true })
})

test('close stops events', async (t) => {
  const dir = await makeTempDir()
  let called = false
  const w = createWatcher(dir, () => { called = true })
  await sleep(100)
  await w.close()
  await fs.writeFile(path.join(dir, 'x.html'), 'x')
  await sleep(500)
  assert.strictEqual(called, false)
  await fs.rm(dir, { recursive: true })
})
