import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

function urlKey(url) {
  return createHash('sha1').update(url).digest('hex')
}

describe('external cache', () => {
  let tmpDir
  let originalCwd

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fin14-external-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
  })

  after(async () => {
    process.chdir(originalCwd)
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('cache write and read returns same body and meta', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')

    const url = 'https://example.com/test-cache-rw.css'
    const key = urlKey(url)
    const cacheDir = join(tmpDir, '.fin14', 'cache')
    await mkdir(cacheDir, { recursive: true })

    const body = Buffer.from('body { color: red; }')
    const meta = {
      url,
      cachedAt: Math.floor(Date.now() / 1000),
      status: 200,
      contentType: 'text/css',
    }
    await writeFile(join(cacheDir, `${key}.body`), body)
    await writeFile(join(cacheDir, `${key}.json`), JSON.stringify(meta))

    const result = await fetchExternal(url, { network: { timeout_ms: 5000, max_redirects: 5 } })
    assert.deepEqual(result.body, body)
    assert.equal(result.status, 200)
    assert.equal(result.contentType, 'text/css')
  })

  it('expired cache triggers refetch (connection refused = throws)', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')

    const url = 'http://localhost:19999/expired.css'
    const key = urlKey(url)
    const cacheDir = join(tmpDir, '.fin14', 'cache')
    await mkdir(cacheDir, { recursive: true })

    const body = Buffer.from('stale')
    const meta = {
      url,
      cachedAt: Math.floor(Date.now() / 1000) - 7200,
      status: 200,
      contentType: 'text/css',
    }
    await writeFile(join(cacheDir, `${key}.body`), body)
    await writeFile(join(cacheDir, `${key}.json`), JSON.stringify(meta))

    await assert.rejects(
      () => fetchExternal(url, { network: { timeout_ms: 2000, max_redirects: 5 } }),
    )
  })

  it('same URL always produces same cache key', () => {
    const url = 'https://cdn.example.com/style.css'
    assert.equal(urlKey(url), urlKey(url))
    assert.notEqual(urlKey(url), urlKey('https://cdn.example.com/other.css'))
  })
})
