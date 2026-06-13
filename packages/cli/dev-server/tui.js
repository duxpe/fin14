import { emitKeypressEvents } from 'node:readline'
import { BYTES_PER_KB, IGNORE_PRESETS, matchGlob } from '@fin14/core'
import { topOffenders, hintLine } from './dev-state.js'
import { formatBytes, dim, red, yellow, green } from '../commands/format.js'
import {
  TUI_FALLBACK_COLUMNS,
  TUI_FALLBACK_ROWS,
  TUI_FRAME_NON_ROW_LINES,
  TUI_PROGRESS_WIDTH,
  TUI_RENDER_DEBOUNCE_MS,
  TUI_TOAST_MS,
} from './constants.js'

export const ACTIONS = {
  QUIT: 'quit',
  REBUILD: 'rebuild',
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  ENTER: 'enter',
  ESC: 'esc',
  SPACE: 'space',
  FILTERS: 'filters',
  CYCLE_VIEW: 'cycleView',
}

export const VIEW_FILTERS = ['all', 'violations', 'budget']

export function nextViewFilter(current) {
  const i = VIEW_FILTERS.indexOf(current)
  return VIEW_FILTERS[(i + 1) % VIEW_FILTERS.length]
}

const VIEW_LABELS = {
  all: 'all pages',
  violations: 'violations + warnings',
  budget: 'budget violations only',
}

export const PRESET_ITEMS = Object.entries(IGNORE_PRESETS).map(([id, p]) => ({ id, label: p.label, globs: p.globs }))

export function filtersItemCount() {
  return PRESET_ITEMS.length + ALL_WARNINGS.length
}

function presetBytes(state, globs) {
  const raw = state.rawSummary
  if (!raw?.results) return 0
  const seen = new Map()
  for (const page of raw.results) {
    for (const r of page.resources ?? []) {
      if (globs.some(g => matchGlob(r.displayPath, g))) seen.set(r.key, r.bytes)
    }
  }
  return [...seen.values()].reduce((a, b) => a + b, 0)
}

function frameworkBandActive(state) {
  return state.mode === 'pages'
    && !state.burst?.active
    && state.frameworkDetected === 'nextjs'
    && !(state.activePresets ?? new Set()).has('nextjs')
}

export const ALL_WARNINGS = [
  { code: 'E06', message: 'CSS file not found — excluded from budget' },
  { code: 'E07', message: 'JS file not found — excluded from budget' },
  { code: 'E08', message: 'Image or font file not found — excluded from budget' },
  { code: 'E09', message: 'External resource fetch failed — budget unknown' },
  { code: 'E10', message: 'CSS @import file not found — excluded' },
  { code: 'E11', message: 'CSS @import cycle detected' },
  { code: 'E13', message: 'Page exceeds IPv6 heuristic (12.2 kB)' },
  { code: 'E14', message: 'External resource counted in budget' },
  { code: 'E15', message: 'Too many open files — retried with smaller batch' },
  { code: 'E19', message: 'Unknown budget from fetch failure or failed build' },
]

function effectiveStatus(page, hidden) {
  if (page.status === 'fail') return 'fail'
  if (page.status === 'warn') {
    const warnings = page.warnings ?? []
    if (warnings.length === 0) return 'warn'
    return warnings.every(w => hidden.has(w.code)) ? 'pass' : 'warn'
  }
  return page.status
}

function filterByView(results, viewFilter, hidden) {
  if (viewFilter === 'violations') return results.filter(p => effectiveStatus(p, hidden) !== 'pass')
  if (viewFilter === 'budget') return results.filter(p => effectiveStatus(p, hidden) === 'fail')
  return results.slice()
}

function recount(results, hidden) {
  let pass = 0, warn = 0, fail = 0
  for (const r of results) {
    const s = effectiveStatus(r, hidden)
    if (s === 'pass') pass++
    else if (s === 'warn') warn++
    else fail++
  }
  return { pass, warn, fail }
}

function trunc(s, w) {
  if (s.length <= w) return s
  return s.slice(0, w - 1) + '…'
}

function toastEntries(state) {
  if (state.mode !== 'pages' || state.burst?.active) return []
  const cutoff = Date.now() - TUI_TOAST_MS
  return (state.activity ?? []).filter(e => e.ts >= cutoff && e.type !== 'measure')
}

function toastActive(state) {
  return toastEntries(state).length > 0
}

function frameExtraLines(state) {
  return (toastActive(state) ? 2 : 0) + (frameworkBandActive(state) ? 1 : 0)
}

function toastLine(state, useColor) {
  const icons = { measure: '✓', rebuild: '↺', error: '✗', info: '·' }
  const entries = toastEntries(state)
  const text = '  ' + entries.map(e => (icons[e.type] ?? '·') + ' ' + e.message).join(' · ')
  if (!useColor) return text
  return entries.some(e => e.type === 'error') ? red(text, true) : dim(text, true)
}

function pageSlots(rows, extra = 0) {
  return Math.max(0, rows - TUI_FRAME_NON_ROW_LINES - extra)
}

function statusRank(status) {
  return { fail: 0, warn: 1, pass: 2 }[status] ?? 3
}

function sortPageRows(results, hidden) {
  return results.slice().sort((a, b) => {
    const sd = statusRank(effectiveStatus(a, hidden)) - statusRank(effectiveStatus(b, hidden))
    if (sd !== 0) return sd
    return b.totalBytes - a.totalBytes
  })
}

function normalizePathKey(path) {
  return String(path).replace(/\\/g, '/')
}

function allPageRows(state) {
  const hidden = state.hiddenWarnings ?? new Set()
  if (state.burst?.active) {
    return sortPageRows(state.burst.violations || [], hidden)
  }
  if (!state.summary) return []
  if (!state.summary.results) return []

  const results = filterByView(state.summary.results, state.viewFilter ?? 'all', hidden)

  if (state.lastBatchPaths && state.lastBatchPaths.length > 0) {
    const changedSet = new Set(state.lastBatchPaths.map(normalizePathKey))
    results.sort((a, b) => {
      const aChanged = changedSet.has(normalizePathKey(a.file)) ? 0 : 1
      const bChanged = changedSet.has(normalizePathKey(b.file)) ? 0 : 1
      if (aChanged !== bChanged) return aChanged - bChanged
      const sd = statusRank(effectiveStatus(a, hidden)) - statusRank(effectiveStatus(b, hidden))
      if (sd !== 0) return sd
      return b.totalBytes - a.totalBytes
    })
  } else {
    return sortPageRows(results, hidden)
  }
  return results
}

export function pageCount(state, rows) {
  const slots = pageSlots(rows, frameExtraLines(state))
  if (slots === 0) return 1
  return Math.max(1, Math.ceil(allPageRows(state).length / slots))
}

export function visiblePageRows(state, rows) {
  const slots = pageSlots(rows, frameExtraLines(state))
  const allRows = allPageRows(state)
  if (state.burst?.active) return allRows.slice(0, slots)
  const page = Math.max(0, Math.min(state.page || 0, pageCount(state, rows) - 1))
  return allRows.slice(page * slots, page * slots + slots)
}

function pageGroupStr(page) {
  const groups = { html: [], css: [], js: [], images: [], external: [] }
  for (const r of page.resources || []) groups[r.group].push(r)
  const gb = (arr) => arr.reduce((s, r) => s + r.bytes, 0)
  const parts = []
  const h = gb(groups.html), c = gb(groups.css), j = gb(groups.js)
  const img = gb(groups.images), e = gb(groups.external)
  if (h > 0) parts.push('HTML ' + (h / BYTES_PER_KB).toFixed(1))
  if (c > 0) parts.push('CSS ' + (c / BYTES_PER_KB).toFixed(1))
  if (j > 0) parts.push('JS ' + (j / BYTES_PER_KB).toFixed(1))
  if (img > 0) parts.push('Imgs ' + (img / BYTES_PER_KB).toFixed(1))
  if (e > 0) parts.push('Ext ' + (e / BYTES_PER_KB).toFixed(1))
  return parts.join('  ')
}

function progressBar(done, total, width = TUI_PROGRESS_WIDTH) {
  if (!total) return '░'.repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function frameHint(state, rows) {
  if (state.burst?.active) {
    if (state.burst.stage === 'settling') {
      if (state.burst.changed === 0) {
        return `updating pages... waiting ${state.currentSettleMs}ms`
      }
      return `updating ${state.burst.changed} file${state.burst.changed === 1 ? '' : 's'}... waiting ${state.currentSettleMs}ms`
    }
    const total = state.burst.total || state.summary?.pages || 0
    const done = state.burst.done || 0
    return `updating ${total} pages...  [${progressBar(done, total)}]  ${done} / ${total}`
  }

  if (state.viewFilter && state.viewFilter !== 'all') {
    const count = allPageRows(state).length
    const total = state.summary?.pages ?? count
    const pages = pageCount(state, rows)
    const current = Math.max(0, Math.min(state.page || 0, pages - 1)) + 1
    return pages > 1
      ? `${count} of ${total} pages — page ${current}/${pages} ← →`
      : `${count} of ${total} pages`
  }

  return hintLine(state)
}

export function formatPageRow(page, width, isSelected, useColor, hidden = new Set()) {
  const statusOrder = { fail: '✗', warn: '⚠', pass: '✓' }
  const status = effectiveStatus(page, hidden)
  let sym = statusOrder[status] ?? '·'
  if (useColor) {
    if (status === 'fail') sym = red(sym, true)
    else if (status === 'warn') sym = yellow(sym, true)
    else sym = green(sym, true)
  }

  const totalKb = (page.totalBytes / BYTES_PER_KB).toFixed(1)
  const limitKb = (page.limitBytes / BYTES_PER_KB).toFixed(1)
  const overKb = page.overBudget
    ? '  +' + ((page.totalBytes - page.limitBytes) / BYTES_PER_KB).toFixed(1)
    : ''
  const groups = pageGroupStr(page)
  const prefix = isSelected ? '>' : ' '
  const sizeStr = `${totalKb} / ${limitKb} kB${overKb}`
  const tail = groups ? `  ${groups}` : ''
  const core = `${prefix} ${sym}  ${sizeStr}`
  const fileSpace = width - core.length - tail.length - 3
  const filePart = fileSpace > 4 ? '  ' + trunc(page.file, fileSpace) : ''
  return trunc(core + filePart + tail, width)
}

export function buildFrame(state, width, rows, useColor) {
  const lines = []
  const hidden = state.hiddenWarnings ?? new Set()

  const { pass: passCount, warn: warnCount, fail: failCount } = recount(state.summary?.results ?? [], hidden)
  const totalPages = state.summary?.pages ?? 0

  const passStr = useColor ? green(String(passCount), true) : String(passCount)
  const warnStr = useColor ? yellow(String(warnCount), true) : String(warnCount)
  const failStr = useColor
    ? (failCount === 0 ? dim(String(failCount), true) : red(String(failCount), true))
    : String(failCount)

  let statusStr = state.status
  if (useColor) {
    if (state.status === 'watching') statusStr = green(state.status, true)
    else if (state.status === 'measuring' || state.status === 'settling') statusStr = yellow(state.status, true)
    else if (state.status === 'rebuilding') statusStr = yellow(state.status, true)
    else if (state.status === 'error') statusStr = red(state.status, true)
    else if (state.status === 'starting') statusStr = dim(state.status, true)
  }

  const line0 = ` fin14  ${state.outputDir}  ${statusStr}    pass ${passStr}  warn ${warnStr}  fail ${failStr}   ${totalPages} pages`
  lines.push(trunc(line0, width))

  let line1 = ` report http://localhost:${state.port}`
  if (state.summary) {
    line1 += `    view: ${VIEW_LABELS[state.viewFilter ?? 'all']}`
  }
  lines.push(trunc(line1, width))

  lines.push(trunc('─'.repeat(width), width))

  const offenders = topOffenders(state)
  const offendersStr = offenders.length === 0
    ? 'none'
    : offenders.map(a => trunc(a.displayPath, 20) + ' ' + formatBytes(a.bytes)).join(' | ')
  lines.push(trunc(` top offenders  ${offendersStr}`, width))

  const hint = frameHint(state, rows)
  lines.push(trunc(` hint           ${hint}`, width))

  lines.push('')

  const pageRows = visiblePageRows(state, rows)

  if (state.mode === 'filters') {
    const cursor = state.filtersCursor ?? 0
    const active = state.activePresets ?? new Set()
    let idx = 0

    lines.push(trunc(' ignore presets', width))
    for (const p of PRESET_ITEMS) {
      const isActive = active.has(p.id)
      const box = isActive
        ? (useColor ? green('[x]', true) : '[x]')
        : '[ ]'
      const prefix = idx === cursor ? '>' : ' '
      const bytes = presetBytes(state, p.globs)
      const size = bytes > 0 ? `  −${formatBytes(bytes)}` : ''
      lines.push(trunc(`${prefix} ${box} ${p.label}${size}`, width))
      idx++
    }

    lines.push(trunc('─'.repeat(width), width))
    lines.push(trunc(' warning filters', width))
    for (const w of ALL_WARNINGS) {
      const isHidden = hidden.has(w.code)
      const dot = isHidden
        ? (useColor ? dim('○', true) : '○')
        : (useColor ? yellow('●', true) : '●')
      const prefix = idx === cursor ? '>' : ' '
      lines.push(trunc(`${prefix} ${dot}  ${w.code}  ${w.message}`, width))
      idx++
    }
    lines.push(trunc('─'.repeat(width), width))
    lines.push(trunc(' Space toggle · ↑↓ navigate · Esc close', width))
    return lines
  }

  if (state.mode === 'detail' && state.detailPageFile) {
    const detailPage = state.summary?.results.find(r => r.file === state.detailPageFile)
    lines.push(trunc(` detail: ${state.detailPageFile}`, width))
    if (detailPage) {
      const totalStr = formatBytes(detailPage.totalBytes)
      const limitStr = formatBytes(detailPage.limitBytes)
      lines.push(trunc(`   total ${totalStr} / ${limitStr}  status ${detailPage.status}`, width))
      const groups = {}
      for (const r of detailPage.resources) {
        if (!groups[r.group]) groups[r.group] = 0
        groups[r.group] += r.bytes
      }
      for (const [g, b] of Object.entries(groups)) {
        if (b > 0) lines.push(trunc(`   ${g.padEnd(10)} ${formatBytes(b)}`, width))
      }
      const visibleWarnings = detailPage.warnings.filter(w => !state.hiddenWarnings.has(w.code))
      if (visibleWarnings.length > 0) {
        for (const w of visibleWarnings.slice(0, 3)) {
          lines.push(trunc(`   ${w.message}`, width))
        }
      }
    }
  } else {
    const activitySlots = pageSlots(rows, frameExtraLines(state))
    if (pageRows.length === 0) {
      if (state.burst?.active) {
        for (let i = 0; i < activitySlots; i++) lines.push('')
        lines.push(trunc('─'.repeat(width), width))
        const footer = ' R rebuild | Q quit'
        lines.push(trunc(footer, width))
        return lines
      }
      if (state.viewFilter && state.viewFilter !== 'all') {
        lines.push(trunc('  no pages in this view', width))
        for (let i = 1; i < activitySlots; i++) lines.push('')
      } else {
        for (let i = 0; i < activitySlots; i++) lines.push('')
      }
    } else {
      const clampedCursor = Math.max(0, Math.min(state.cursor, pageRows.length - 1))
      for (let i = 0; i < pageRows.length; i++) {
        lines.push(formatPageRow(pageRows[i], width, i === clampedCursor, useColor, hidden))
      }
    }
  }

  lines.push(trunc('─'.repeat(width), width))

  let footer
  if (state.mode === 'detail') {
    footer = ' Esc close | Q quit | R rebuild'
  } else {
    if (toastActive(state)) {
      lines.push(trunc(toastLine(state, useColor), width))
      lines.push(trunc('─'.repeat(width), width))
    }
    if (frameworkBandActive(state)) {
      const bytes = presetBytes(state, IGNORE_PRESETS.nextjs.globs)
      const band = ` ⚡ Next.js detected — press F to ignore ${formatBytes(bytes)} shared JS`
      lines.push(trunc(useColor ? yellow(band, true) : band, width))
    }
    const pageSeg = pageCount(state, rows) > 1 ? ' ←→ page |' : ''
    footer = ` R rebuild | Q quit | ↑↓ navigate |${pageSeg} Enter detail · F filters · Shift+Tab to switch view`
  }
  lines.push(trunc(footer, width))

  return lines
}

export function paintFrame(stdout, lines) {
  stdout.cursorTo(0, 0)
  stdout.clearScreenDown()
  stdout.write(lines.join('\n'))
}

export function startTui(state, onAction) {
  if (!state.isTTY) {
    return {
      render() {},
      stop() {},
    }
  }

  process.stdout.write('\x1b[?25l')

  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()

  let renderTimer = null
  let toastTimer = null

  function keypressHandler(str, key) {
    if (!key) return
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) onAction(ACTIONS.QUIT)
    else if (key.name === 'r') onAction(ACTIONS.REBUILD)
    else if (key.name === 'up') onAction(ACTIONS.UP)
    else if (key.name === 'down') onAction(ACTIONS.DOWN)
    else if (key.name === 'left') onAction(ACTIONS.LEFT)
    else if (key.name === 'right') onAction(ACTIONS.RIGHT)
    else if (key.name === 'return') onAction(ACTIONS.ENTER)
    else if (key.name === 'escape') onAction(ACTIONS.ESC)
    else if (key.name === 'space') onAction(ACTIONS.SPACE)
    else if (key.name === 'f') onAction(ACTIONS.FILTERS)
    else if (key.name === 'tab' && key.shift) onAction(ACTIONS.CYCLE_VIEW)
  }

  process.stdin.on('keypress', keypressHandler)

  function scheduleToastClear() {
    clearTimeout(toastTimer)
    toastTimer = null
    const entries = toastEntries(state)
    if (entries.length === 0) return
    const newest = entries[entries.length - 1]
    const remaining = newest.ts + TUI_TOAST_MS - Date.now()
    if (remaining > 0) toastTimer = setTimeout(doRepaint, remaining + 20)
  }

  function doRepaint() {
    const width = process.stdout.columns || TUI_FALLBACK_COLUMNS
    const rows = process.stdout.rows || TUI_FALLBACK_ROWS
    const useColor = process.stdout.hasColors?.() ?? false
    const lines = buildFrame(state, width, rows, useColor)
    paintFrame(process.stdout, lines)
    scheduleToastClear()
  }

  function render() {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(doRepaint, TUI_RENDER_DEBOUNCE_MS)
  }

  function renderNow() {
    clearTimeout(renderTimer)
    doRepaint()
  }

  function stop() {
    clearTimeout(renderTimer)
    clearTimeout(toastTimer)
    process.stdin.removeListener('keypress', keypressHandler)
    process.stdin.setRawMode(false)
    process.stdin.pause()
    process.stdout.write('\x1b[?25h')
  }

  return { render, renderNow, stop }
}
