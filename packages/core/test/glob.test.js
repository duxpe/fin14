import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { matchGlob, filterPages, resolveBudget } from '../src/glob.js'

describe('matchGlob', () => {
  it('exact filename', () => {
    assert.equal(matchGlob('404.html', '404.html'), true)
    assert.equal(matchGlob('index.html', '404.html'), false)
  })

  it('* does not cross directory boundary', () => {
    assert.equal(matchGlob('foo.html', '*.html'), true)
    assert.equal(matchGlob('blog/foo.html', '*.html'), false)
  })

  it('** crosses directory boundaries', () => {
    assert.equal(matchGlob('tags/a/index.html', 'tags/**'), true)
    assert.equal(matchGlob('tags/index.html', 'tags/**'), true)
    assert.equal(matchGlob('blog/post.html', 'tags/**'), false)
  })

  it('** with suffix', () => {
    assert.equal(matchGlob('blog/2026/post.html', 'blog/**/*.html'), true)
    assert.equal(matchGlob('blog/post.html', 'blog/**/*.html'), true)
    assert.equal(matchGlob('shop/post.html', 'blog/**/*.html'), false)
  })

  it('? matches a single non-slash char', () => {
    assert.equal(matchGlob('a.html', '?.html'), true)
    assert.equal(matchGlob('ab.html', '?.html'), false)
  })

  it('anchored — no false partial match', () => {
    assert.equal(matchGlob('admin-area.html', 'admin'), false)
    assert.equal(matchGlob('x404.html', '404.html'), false)
  })

  it('normalizes backslashes', () => {
    assert.equal(matchGlob('tags\\a.html', 'tags/**'), true)
  })
})

describe('filterPages', () => {
  const paths = ['index.html', 'blog/a.html', 'tags/x.html', '404.html']

  it('empty include + exclude → all pass', () => {
    const config = { project: { include: [], exclude: [] } }
    assert.deepEqual(filterPages(paths, config), paths)
  })

  it('exclude removes matches', () => {
    const config = { project: { include: [], exclude: ['tags/**', '404.html'] } }
    assert.deepEqual(filterPages(paths, config), ['index.html', 'blog/a.html'])
  })

  it('include acts as allow-list', () => {
    const config = { project: { include: ['blog/**'], exclude: [] } }
    assert.deepEqual(filterPages(paths, config), ['blog/a.html'])
  })

  it('exclude wins over include', () => {
    const config = { project: { include: ['blog/**', 'index.html'], exclude: ['blog/**'] } }
    assert.deepEqual(filterPages(paths, config), ['index.html'])
  })
})

describe('resolveBudget', () => {
  const config = {
    budget: {
      default: 14000,
      overrides: [
        { path: 'gallery/**', budget: 50000 },
        { path: 'blog/**/*.html', budget: 20000 },
      ],
    },
  }

  it('falls back to default when no override matches', () => {
    assert.equal(resolveBudget('index.html', config), 14000)
  })

  it('first matching override wins', () => {
    assert.equal(resolveBudget('gallery/a.html', config), 50000)
    assert.equal(resolveBudget('blog/2026/post.html', config), 20000)
  })

  it('no overrides → default', () => {
    assert.equal(resolveBudget('x.html', { budget: { default: 14000 } }), 14000)
  })
})
