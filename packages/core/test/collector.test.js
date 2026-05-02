import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collect } from '../src/budget/collector.js'

const DEFAULT_CONFIG = {
  viewport: {
    default: 'mobile',
    mobile: { width: 390, height: 844, lazy_visible_images: 1 },
    desktop: { width: 1366, height: 768, lazy_visible_images: 1 },
  },
}

async function setup(files) {
  const dir = await mkdtemp(join(tmpdir(), 'fin14-collector-'))
  for (const [name, content] of Object.entries(files)) {
    const fullPath = join(dir, name)
    const parts = name.split('/')
    if (parts.length > 1) {
      await mkdir(join(dir, ...parts.slice(0, -1)), { recursive: true })
    }
    await writeFile(fullPath, content)
  }
  return dir
}

describe('collector', () => {
  let dir
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }) })

  it('1: plain HTML returns only html ref', async () => {
    dir = await setup({ 'index.html': '<!doctype html><html><body></body></html>' })
    const html = join(dir, 'index.html')
    const { refs, skipped, warnings } = await collect(html, dir, DEFAULT_CONFIG)
    assert.equal(refs.length, 1)
    assert.equal(refs[0].type, 'html')
    assert.equal(refs[0].group, 'html')
    assert.equal(refs[0].inline, true)
    assert.equal(skipped.length, 0)
    assert.equal(warnings.length, 0)
  })

  it('2: <link rel=stylesheet> collects css ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head></html>',
      'style.css': 'body{}',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const css = refs.find(r => r.type === 'css')
    assert.ok(css)
    assert.equal(css.group, 'css')
    assert.equal(css.inline, false)
    assert.equal(css.external, false)
  })

  it('3: inline <style> bytes are part of HTML — no separate css ref', async () => {
    dir = await setup({ 'index.html': '<!doctype html><html><head><style>body{color:red}</style></head></html>' })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    // inline CSS is not a separate counted ref — bytes are in the HTML ref
    assert.equal(refs.filter(r => r.type === 'css').length, 0)
    const htmlRef = refs.find(r => r.type === 'html')
    assert.ok(htmlRef)
    assert.ok(htmlRef.inlineContent.toString().includes('body{color:red}'))
  })

  it('4: <script src> collects js ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><body><script src="app.js"></script></body></html>',
      'app.js': 'console.log(1)',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const js = refs.find(r => r.type === 'js')
    assert.ok(js)
    assert.equal(js.group, 'js')
    assert.equal(js.inline, false)
  })

  it('5: <img src> without lazy collects image ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><body><img src="photo.jpg"></body></html>',
      'photo.jpg': '',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const img = refs.find(r => r.type === 'image')
    assert.ok(img)
    assert.equal(img.group, 'images')
  })

  it('6: lazy images up to limit included, excess skipped', async () => {
    dir = await setup({
      'index.html': `<!doctype html><html><body>
        <img src="a.jpg" loading="lazy">
        <img src="b.jpg" loading="lazy">
      </body></html>`,
      'a.jpg': '',
      'b.jpg': '',
    })
    const html = join(dir, 'index.html')
    const { refs, skipped } = await collect(html, dir, DEFAULT_CONFIG)
    const images = refs.filter(r => r.type === 'image')
    assert.equal(images.length, 1)
    const lazySkipped = skipped.filter(s => s.reason === 'outside_matrix')
    assert.equal(lazySkipped.length, 1)
  })

  it('7: <picture><source srcset><img src> — fallback img collected, srcset skipped', async () => {
    dir = await setup({
      'index.html': `<!doctype html><html><body>
        <picture>
          <source srcset="hero.webp">
          <img src="fallback.jpg">
        </picture>
      </body></html>`,
      'fallback.jpg': '',
    })
    const html = join(dir, 'index.html')
    const { refs, skipped } = await collect(html, dir, DEFAULT_CONFIG)
    const img = refs.find(r => r.type === 'image')
    assert.ok(img)
    assert.ok(img.displayPath.includes('fallback.jpg'))
    const srcsetSkipped = skipped.filter(s => s.reason === 'srcset_alternative')
    assert.ok(srcsetSkipped.length > 0)
  })

  it('8: root-relative URL /assets/style.css resolved to outputDir', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="/assets/style.css"></head></html>',
      'assets/style.css': 'body{}',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const css = refs.find(r => r.type === 'css')
    assert.ok(css)
    assert.ok(css.path.includes('assets/style.css'))
    assert.equal(css.external, false)
  })

  it('9: duplicate ref → second becomes skipped with reason=duplicate', async () => {
    dir = await setup({
      'index.html': `<!doctype html><html><head>
        <link rel="stylesheet" href="style.css">
        <link rel="stylesheet" href="style.css">
      </head></html>`,
      'style.css': 'body{}',
    })
    const html = join(dir, 'index.html')
    const { refs, skipped } = await collect(html, dir, DEFAULT_CONFIG)
    const cssRefs = refs.filter(r => r.type === 'css')
    assert.equal(cssRefs.length, 1)
    const dup = skipped.find(s => s.reason === 'duplicate')
    assert.ok(dup)
    assert.ok(dup.countedAs)
  })

  it('10: CSS @import collects imported file as css ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="main.css"></head></html>',
      'main.css': "@import 'tokens.css'; body{}",
      'tokens.css': ':root{--color: red}',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const cssPaths = refs.filter(r => r.type === 'css').map(r => r.displayPath)
    assert.ok(cssPaths.some(p => p.includes('tokens.css')))
  })

  it('11: CSS @import cycle → E11 warning', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head></html>',
      'a.css': "@import 'b.css'; .a{}",
      'b.css': "@import 'a.css'; .b{}",
    })
    const html = join(dir, 'index.html')
    const { warnings } = await collect(html, dir, DEFAULT_CONFIG)
    const e11 = warnings.find(w => w.code === 'E11')
    assert.ok(e11)
  })

  it('12: CSS @import missing file → E10 warning', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="main.css"></head></html>',
      'main.css': "@import 'missing.css'; body{}",
    })
    const html = join(dir, 'index.html')
    const { warnings } = await collect(html, dir, DEFAULT_CONFIG)
    const e10 = warnings.find(w => w.code === 'E10')
    assert.ok(e10)
  })

  it('13: @font-face src url collects font ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="fonts.css"></head></html>',
      'fonts.css': "@font-face { font-family: Inter; src: url('Inter.woff2') format('woff2'); }",
      'Inter.woff2': '',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const font = refs.find(r => r.type === 'font')
    assert.ok(font)
    assert.ok(font.displayPath.includes('Inter.woff2'))
  })

  it('14: external absolute URL stylesheet → external ref', async () => {
    dir = await setup({
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head></html>',
    })
    const html = join(dir, 'index.html')
    const { refs } = await collect(html, dir, DEFAULT_CONFIG)
    const ext = refs.find(r => r.external)
    assert.ok(ext)
    assert.equal(ext.group, 'external')
  })

  it('15: preload duplicate of img → second becomes skipped', async () => {
    dir = await setup({
      'index.html': `<!doctype html><html><head>
        <link rel="preload" href="hero.jpg" as="image">
      </head><body>
        <img src="hero.jpg">
      </body></html>`,
      'hero.jpg': '',
    })
    const html = join(dir, 'index.html')
    const { refs, skipped } = await collect(html, dir, DEFAULT_CONFIG)
    const images = refs.filter(r => r.type === 'image')
    assert.equal(images.length, 1)
    const dup = skipped.find(s => s.reason === 'duplicate')
    assert.ok(dup)
  })
})
