const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'

export function formatBytes(n) {
  if (n === 0) return '—'
  return (n / 1000).toFixed(1) + ' kB'
}

export function statusSymbol(status, isTTY) {
  if (status === 'pass') return (isTTY ? GREEN : '') + '✓' + (isTTY ? RESET : '')
  if (status === 'warn') return (isTTY ? YELLOW : '') + '⚠' + (isTTY ? RESET : '')
  return (isTTY ? RED : '') + '✗' + (isTTY ? RESET : '')
}

export function dim(text, isTTY) {
  return isTTY ? DIM + text + RESET : text
}

export function bold(text, isTTY) {
  return isTTY ? BOLD + text + RESET : text
}

export function red(text, isTTY) {
  return isTTY ? RED + text + RESET : text
}

export function yellow(text, isTTY) {
  return isTTY ? YELLOW + text + RESET : text
}

export function green(text, isTTY) {
  return isTTY ? GREEN + text + RESET : text
}

export function separator() {
  return '  ' + '─'.repeat(64)
}

export function formatWarning(warning, isTTY) {
  return '  ' + (isTTY ? YELLOW : '') + '⚠' + (isTTY ? RESET : '') + '  ' + warning.code + '  ' + warning.message
}

const HINTS = {
  image: 'consider marking as lazy or resizing',
  css: 'CSS looks large; consider purge',
  js: 'JS looks large; consider splitting or deferring',
  font: 'consider subsetting or self-hosting',
  html: 'HTML is large',
}

export function formatCutCandidate(resource, isTTY) {
  const hint = HINTS[resource.type] ?? 'large resource'
  return '  → ' + resource.displayPath.padEnd(24) + formatBytes(resource.bytes).padEnd(10) + hint
}

export function formatGroupLine(label, resources, isTTY) {
  if (resources.length === 0) {
    return '  ' + label.padEnd(8) + '—'
  }

  const groupBytes = resources.reduce((sum, r) => sum + r.bytes, 0)
  const lines = ['  ' + label.padEnd(8) + formatBytes(groupBytes).padEnd(10) + resources[0].displayPath]

  if (label === 'Images') {
    for (let i = 1; i < resources.length; i++) {
      lines.push('  ' + ''.padEnd(8) + ''.padEnd(10) + resources[i].displayPath.padEnd(20) + formatBytes(resources[i].bytes))
    }
  } else {
    for (let i = 1; i < resources.length; i++) {
      lines.push('  ' + ''.padEnd(18) + resources[i].displayPath)
    }
  }

  return lines.join('\n')
}

export function pageGroupSummary(result) {
  const groups = { html: [], css: [], js: [], images: [], external: [] }
  for (const r of result.resources) groups[r.group].push(r)
  const gb = (arr) => arr.reduce((s, r) => s + r.bytes, 0)
  const parts = []
  const h = gb(groups.html), c = gb(groups.css), j = gb(groups.js)
  const i = gb(groups.images), e = gb(groups.external)
  if (h > 0) parts.push('HTML ' + formatBytes(h))
  if (c > 0) parts.push('CSS ' + formatBytes(c))
  if (j > 0) parts.push('JS ' + formatBytes(j))
  if (i > 0) parts.push('Imgs ' + formatBytes(i))
  if (e > 0) parts.push('Ext ' + formatBytes(e))
  return parts.join('  ')
}
