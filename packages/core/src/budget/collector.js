import { readFile } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { parse } from 'parse5'
import { parse as parseCss, walk as walkCss } from 'css-tree'

function walk(node, fn) {
  fn(node)
  if (node.childNodes) node.childNodes.forEach(c => walk(c, fn))
}

function attr(node, name) {
  return node.attrs?.find(a => a.name === name)?.value
}

function textContent(node) {
  if (!node.childNodes) return ''
  return node.childNodes
    .filter(c => c.nodeName === '#text')
    .map(c => c.value)
    .join('')
}

function resolveUrl(href, baseFile, outputDir) {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    const u = new URL(href)
    u.hash = ''
    const key = u.href
    const displayPath = u.hostname + u.pathname
    return { external: true, key, path: href, displayPath }
  }
  let absPath
  if (href.startsWith('/')) {
    absPath = resolve(outputDir, href.slice(1))
  } else {
    absPath = resolve(dirname(baseFile), href)
  }
  const hashIdx = absPath.indexOf('#')
  const queryIdx = absPath.indexOf('?')
  const cutIdx = [hashIdx, queryIdx].filter(i => i !== -1).reduce((a, b) => Math.min(a, b), absPath.length)
  const key = absPath.slice(0, cutIdx)
  return { external: false, key, path: key, displayPath: relative(outputDir, key) }
}

function typeFromAs(asVal) {
  if (asVal === 'script') return 'js'
  if (asVal === 'style') return 'css'
  if (asVal === 'image') return 'image'
  if (asVal === 'font') return 'font'
  return null
}

function groupFromType(type, external) {
  if (external) return 'external'
  if (type === 'html') return 'html'
  if (type === 'css') return 'css'
  if (type === 'js') return 'js'
  if (type === 'image') return 'images'
  if (type === 'font') return 'css'
  return 'external'
}

function extractCssImportUrl(node) {
  const prelude = node.prelude
  if (!prelude) return null
  let url = null
  walkCss(prelude, n => {
    if (url) return
    if (n.type === 'String') {
      url = n.value.replace(/^['"]|['"]$/g, '')
    } else if (n.type === 'Url') {
      const val = n.value
      if (val.type === 'String') {
        url = val.value.replace(/^['"]|['"]$/g, '')
      } else if (val.type === 'Raw') {
        url = val.value
      }
    }
  })
  return url
}

function extractFontFaceSrc(node) {
  const results = []
  if (!node.block) return results
  walkCss(node.block, decl => {
    if (decl.type !== 'Declaration' || decl.property !== 'src') return
    const urls = []
    walkCss(decl.value, n => {
      if (n.type === 'Url') {
        const val = n.value
        let href = ''
        if (typeof val === 'string') {
          href = val.replace(/^['"]|['"]$/g, '')
        } else if (val && val.type === 'String') {
          href = val.value.replace(/^['"]|['"]$/g, '')
        } else if (val && val.type === 'Raw') {
          href = val.value
        }
        if (href) urls.push(href)
      }
    })
    results.push(...urls)
  })
  return results
}

function addRef(resolved, type, group, seenKeys, refs, skipped) {
  if (seenKeys.has(resolved.key)) {
    skipped.push({ key: resolved.key, type, displayPath: resolved.displayPath, reason: 'duplicate', countedAs: seenKeys.get(resolved.key) })
  } else {
    seenKeys.set(resolved.key, group)
    refs.push({ key: resolved.key, type, group, path: resolved.path, displayPath: resolved.displayPath, external: resolved.external, inline: false })
  }
}

// stack: Set of abs paths currently in the import chain — used only for cycle detection.
// seenKeys handles dedup (already counted → skip as duplicate, not a cycle).
async function processCss(cssContent, cssFile, outputDir, seenKeys, refs, skipped, warnings, stack, htmlFile) {
  const ast = parseCss(cssContent, { parseValue: true, onParseError: () => {} })
  const baseFile = cssFile || htmlFile
  const imports = []

  walkCss(ast, {
    visit: 'Atrule',
    enter(node) {
      if (node.name === 'import') {
        const href = extractCssImportUrl(node)
        if (!href || href.startsWith('http://') || href.startsWith('https://')) return
        imports.push(href)
      } else if (node.name === 'font-face') {
        const urls = extractFontFaceSrc(node)
        for (let i = 0; i < urls.length; i++) {
          const href = urls[i]
          const resolved = resolveUrl(href, baseFile, outputDir)
          const type = 'font'
          const group = groupFromType(type, resolved.external)
          if (i === 0) {
            addRef(resolved, type, group, seenKeys, refs, skipped)
          } else {
            skipped.push({ key: resolved.key, type, displayPath: resolved.displayPath, reason: 'alternate_font_src' })
          }
        }
      }
    }
  })

  for (const href of imports) {
    const absPath = resolve(dirname(baseFile), href)

    if (stack.has(absPath)) {
      warnings.push({ code: 'E11', message: `CSS @import cycle detected: ${absPath}`, path: absPath, strictFailure: false })
      continue
    }

    let content
    try {
      content = await readFile(absPath, 'utf8')
    } catch {
      warnings.push({ code: 'E10', message: `CSS @import file not found: ${absPath}`, path: absPath, strictFailure: false })
      continue
    }

    const displayPath = relative(outputDir, absPath)
    if (!seenKeys.has(absPath)) {
      seenKeys.set(absPath, 'css')
      refs.push({ key: absPath, type: 'css', group: 'css', path: absPath, displayPath, external: false, inline: false })
      await processCss(content, absPath, outputDir, seenKeys, refs, skipped, warnings, new Set([...stack, absPath]), htmlFile)
    } else {
      skipped.push({ key: absPath, type: 'css', displayPath, reason: 'duplicate', countedAs: seenKeys.get(absPath) })
    }
  }
}

export async function collect(htmlFile, outputDir, config) {
  const refs = []
  const skipped = []
  const warnings = []
  const seenKeys = new Map()

  const htmlBuffer = await readFile(htmlFile)
  seenKeys.set(htmlFile, 'html')
  refs.push({
    key: htmlFile,
    type: 'html',
    group: 'html',
    path: htmlFile,
    displayPath: relative(outputDir, htmlFile),
    external: false,
    inline: true,
    inlineContent: htmlBuffer,
  })

  const dom = parse(htmlBuffer.toString('utf8'))
  const vp = config.viewport[config.viewport.default]
  const maxLazy = vp.lazy_visible_images
  let lazyCount = 0
  const cssQueue = []

  walk(dom, node => {
    if (node.nodeName === 'link') {
      const rel = attr(node, 'rel')
      const href = attr(node, 'href')
      if (!href) return

      if (rel === 'stylesheet') {
        const resolved = resolveUrl(href, htmlFile, outputDir)
        addRef(resolved, 'css', groupFromType('css', resolved.external), seenKeys, refs, skipped)
        if (!resolved.external) cssQueue.push({ absPath: resolved.key, inline: false })
      } else if (rel === 'preload') {
        const type = typeFromAs(attr(node, 'as'))
        if (!type) return
        const resolved = resolveUrl(href, htmlFile, outputDir)
        addRef(resolved, type, groupFromType(type, resolved.external), seenKeys, refs, skipped)
      } else if (rel === 'modulepreload') {
        const resolved = resolveUrl(href, htmlFile, outputDir)
        addRef(resolved, 'js', groupFromType('js', resolved.external), seenKeys, refs, skipped)
      }
    } else if (node.nodeName === 'style') {
      // inline CSS bytes are part of HTML — parse for @import/@font-face discovery only
      cssQueue.push({ inline: true, content: textContent(node) })
    } else if (node.nodeName === 'script') {
      const src = attr(node, 'src')
      const type = attr(node, 'type')
      if (src && (type === undefined || type === null || type === 'module' || type === 'text/javascript')) {
        const resolved = resolveUrl(src, htmlFile, outputDir)
        addRef(resolved, 'js', groupFromType('js', resolved.external), seenKeys, refs, skipped)
      }
      // inline scripts: bytes are part of HTML, not counted separately
    } else if (node.nodeName === 'img') {
      const src = attr(node, 'src')
      const srcset = attr(node, 'srcset')
      const loading = attr(node, 'loading')

      if (srcset) {
        const resolved = resolveUrl(srcset.split(/[\s,]+/)[0], htmlFile, outputDir)
        skipped.push({ key: resolved.key, type: 'image', displayPath: resolved.displayPath, reason: 'srcset_alternative' })
      }

      if (src) {
        if (loading === 'lazy') {
          if (lazyCount < maxLazy) {
            lazyCount++
            const resolved = resolveUrl(src, htmlFile, outputDir)
            addRef(resolved, 'image', groupFromType('image', resolved.external), seenKeys, refs, skipped)
          } else {
            const resolved = resolveUrl(src, htmlFile, outputDir)
            skipped.push({ key: resolved.key, type: 'image', displayPath: resolved.displayPath, reason: 'outside_matrix' })
          }
        } else {
          const resolved = resolveUrl(src, htmlFile, outputDir)
          addRef(resolved, 'image', groupFromType('image', resolved.external), seenKeys, refs, skipped)
        }
      }
    } else if (node.nodeName === 'source') {
      const srcset = attr(node, 'srcset')
      if (srcset) {
        const firstSrc = srcset.split(/[\s,]+/).find(s => s && !s.includes('w') && !s.includes('x')) || srcset.split(/[\s,]+/)[0]
        if (firstSrc) {
          const resolved = resolveUrl(firstSrc, htmlFile, outputDir)
          skipped.push({ key: resolved.key, type: 'image', displayPath: resolved.displayPath, reason: 'srcset_alternative' })
        }
      }
    }
  })

  // processedCss tracks which CSS files' content has been parsed for @imports.
  // Separate from seenKeys (which tracks counted refs) — prevents re-parsing the same
  // file if it appears multiple times in the HTML (e.g., duplicate <link> tags).
  const processedCss = new Set()

  for (const item of cssQueue) {
    if (item.inline) {
      await processCss(item.content, null, outputDir, seenKeys, refs, skipped, warnings, new Set(), htmlFile)
    } else {
      if (processedCss.has(item.absPath)) continue
      processedCss.add(item.absPath)
      let content
      try {
        content = await readFile(item.absPath, 'utf8')
      } catch {
        continue
      }
      await processCss(content, item.absPath, outputDir, seenKeys, refs, skipped, warnings, new Set([item.absPath]), htmlFile)
    }
  }

  return { refs, skipped, warnings }
}
