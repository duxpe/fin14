import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { crawl } from '../src/crawler.js'

describe('crawl', () => {
  it('finds .html files recursively in nested dirs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-'))
    try {
      await mkdir(join(dir, 'subdir'), { recursive: true })
      await writeFile(join(dir, 'index.html'), '<html></html>')
      await writeFile(join(dir, 'subdir', 'page.html'), '<html></html>')
      const result = await crawl(dir)
      assert.deepEqual(result, ['index.html', 'subdir/page.html'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips non-.html files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-skip-'))
    try {
      await writeFile(join(dir, 'index.html'), '<html></html>')
      await writeFile(join(dir, 'style.css'), 'body {}')
      await writeFile(join(dir, 'script.js'), 'console.log()')
      const result = await crawl(dir)
      assert.deepEqual(result, ['index.html'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns sorted relative paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-sort-'))
    try {
      await writeFile(join(dir, 'z.html'), '<html></html>')
      await writeFile(join(dir, 'a.html'), '<html></html>')
      await writeFile(join(dir, 'm.html'), '<html></html>')
      const result = await crawl(dir)
      assert.deepEqual(result, ['a.html', 'm.html', 'z.html'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array for dir with no html files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-empty-'))
    try {
      await writeFile(join(dir, 'readme.txt'), 'text')
      await mkdir(join(dir, 'subdir'))
      const result = await crawl(dir)
      assert.deepEqual(result, [])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips directory symlinks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-dirsym-'))
    const targetDir = await mkdtemp(join(tmpdir(), 'fin14-crawl-target-'))
    try {
      await writeFile(join(targetDir, 'external.html'), '<html></html>')
      await writeFile(join(dir, 'index.html'), '<html></html>')
      await symlink(targetDir, join(dir, 'link'), 'dir')
      const result = await crawl(dir)
      assert.deepEqual(result, ['index.html'])
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(targetDir, { recursive: true, force: true })
    }
  })

  it('follows file symlinks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fin14-crawl-filesym-'))
    try {
      await writeFile(join(dir, 'target.html'), '<html></html>')
      await symlink(join(dir, 'target.html'), join(dir, 'link.html'))
      const result = await crawl(dir)
      assert.deepEqual(result, ['link.html', 'target.html'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
