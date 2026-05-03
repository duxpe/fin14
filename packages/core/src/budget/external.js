import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_CONFIG,
  EXTERNAL_CACHE_TTL_SECONDS,
  EXTERNAL_DOMAIN_CONCURRENCY,
  EXTERNAL_DOMAIN_WAIT_MS,
  MILLISECONDS_PER_SECOND,
} from '../constants.js'

function cacheDir() {
  return join(process.cwd(), '.fin14', 'cache')
}

function urlKey(url) {
  return createHash('sha1').update(url).digest('hex')
}

async function readCache(url) {
  const dir = cacheDir()
  const key = urlKey(url)
  try {
    const meta = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8'))
    if (Math.floor(Date.now() / MILLISECONDS_PER_SECOND) - meta.cachedAt > EXTERNAL_CACHE_TTL_SECONDS) return null
    const body = await readFile(join(dir, `${key}.body`))
    return { body, status: meta.status, contentType: meta.contentType }
  } catch {
    return null
  }
}

async function writeCache(url, body, status, contentType) {
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })
  const key = urlKey(url)
  const meta = { url, cachedAt: Math.floor(Date.now() / MILLISECONDS_PER_SECOND), status, contentType }
  await writeFile(join(dir, `${key}.body`), body)
  await writeFile(join(dir, `${key}.json`), JSON.stringify(meta))
}

const domainCounts = new Map()

async function withDomainLimit(hostname, fn) {
  while ((domainCounts.get(hostname) ?? 0) >= EXTERNAL_DOMAIN_CONCURRENCY) {
    await new Promise(r => setTimeout(r, EXTERNAL_DOMAIN_WAIT_MS))
  }
  domainCounts.set(hostname, (domainCounts.get(hostname) ?? 0) + 1)
  try { return await fn() }
  finally { domainCounts.set(hostname, domainCounts.get(hostname) - 1) }
}

export async function fetchExternal(url, config) {
  const cached = await readCache(url)
  if (cached) return cached

  const hostname = new URL(url).hostname
  return withDomainLimit(hostname, async () => {
    const timeoutMs = config?.network?.timeout_ms ?? DEFAULT_CONFIG.network.timeout_ms
    const maxRedirects = config?.network?.max_redirects ?? DEFAULT_CONFIG.network.max_redirects
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      let redirectCount = 0
      let currentUrl = url
      let res

      while (true) {
        res = await fetch(currentUrl, { redirect: 'manual', signal: controller.signal })
        if (res.status >= 300 && res.status < 400) {
          if (++redirectCount > maxRedirects) throw new Error('too many redirects')
          const location = res.headers.get('location')
          if (!location) throw new Error('redirect missing location header')
          currentUrl = new URL(location, currentUrl).href
          continue
        }
        break
      }

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`)
      }

      const body = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') ?? ''
      await writeCache(url, body, res.status, contentType)
      return { body, status: res.status, contentType }
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`timeout fetching ${url}`)
      throw err
    } finally {
      clearTimeout(timer)
    }
  })
}
