import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

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

describe('external fetch live', () => {
  let server
  let baseUrl
  let requestCount
  const openSockets = new Set()

  before(async () => {
    requestCount = 0
    server = createServer((req, res) => {
      requestCount++
      if (req.url === '/style.css') {
        res.writeHead(200, { 'content-type': 'text/css' })
        res.end('body{color:red}')
      } else if (req.url === '/redirect') {
        res.writeHead(301, { location: '/style.css' })
        res.end()
      } else if (req.url === '/not-found') {
        res.writeHead(404)
        res.end('Not Found')
      }
      // /slow: intentionally no response → timeout
    })
    server.on('connection', s => { openSockets.add(s); s.on('close', () => openSockets.delete(s)) })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    for (const s of openSockets) s.destroy()
    await new Promise(r => server.close(r))
  })

  let tmpDir
  let originalCwd
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fin14-ext-live-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
    requestCount = 0
  })
  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('fetch success: returns body buffer and status 200', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')
    const url = `${baseUrl}/style.css`
    const result = await fetchExternal(url, { network: { timeout_ms: 5000, max_redirects: 5 } })
    assert.equal(result.status, 200)
    assert.ok(result.body.length > 0)
    assert.ok(result.contentType.includes('text/css'))
  })

  it('fetch 404: throws error (non-2xx status)', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')
    const url = `${baseUrl}/not-found`
    await assert.rejects(
      () => fetchExternal(url, { network: { timeout_ms: 5000, max_redirects: 5 } }),
    )
  })

  it('fetch redirect: follows 301 to final destination', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')
    const url = `${baseUrl}/redirect`
    const result = await fetchExternal(url, { network: { timeout_ms: 5000, max_redirects: 5 } })
    assert.equal(result.status, 200)
    assert.ok(result.body.length > 0)
  })

  it('fetch timeout: throws when server does not respond', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')
    const url = `${baseUrl}/slow`
    await assert.rejects(
      () => fetchExternal(url, { network: { timeout_ms: 150, max_redirects: 5 } }),
    )
  })

  it('cache hit: second fetch served from cache, no new server request', async () => {
    const { fetchExternal } = await import('../src/budget/external.js')
    const url = `${baseUrl}/style.css`
    const config = { network: { timeout_ms: 5000, max_redirects: 5 } }
    await fetchExternal(url, config)
    const countAfterFirst = requestCount
    await fetchExternal(url, config)
    assert.equal(requestCount, countAfterFirst)
  })
})
