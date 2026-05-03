import { loadConfig, measureSite } from '@fin14/core'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import {
  beginBurst,
  createState,
  computeSettleMs,
  finishBurst,
  recordBuildTime,
  recordBurstPage,
  startBurstMeasure,
  pushActivity,
} from '../dev-server/dev-state.js'
import { createSsePool } from '../dev-server/sse.js'
import { startServer } from '../dev-server/server.js'
import { createWatcher } from '../dev-server/watcher.js'
import { startTui, ACTIONS, ALL_WARNINGS, pageCount, visiblePageRows } from '../dev-server/tui.js'

export async function runDev(parsed) {
  const isTTY = process.stdout.isTTY === true

  let config
  try {
    config = await loadConfig({ config: parsed.flags.config, outputDir: parsed.args[0] })
  } catch (err) {
    process.stderr.write(err.message + '\n')
    process.exit(1)
  }

  const outputDir = parsed.args[0] ?? config.project?.output_dir
  if (!outputDir) {
    process.stderr.write('fin14: no output directory found\n')
    process.exit(1)
  }

  const state = createState(outputDir, config, isTTY)
  state.hiddenWarnings = new Set(config.warnings?.exclude ?? [])
  const pool = createSsePool()

  let closeServer
  try {
    const server = await startServer(pool, state, {
      onToggleWarning: (code) => {
        if (state.hiddenWarnings.has(code)) {
          state.hiddenWarnings.delete(code)
        } else {
          state.hiddenWarnings.add(code)
        }
        tui.renderNow()
        if (state.summary) {
          pool.broadcast('summary', { ...state.summary, hiddenWarnings: [...state.hiddenWarnings], cutCandidateMinBytes: config.budget?.cut_candidate_min_bytes ?? 2800 })
        }
      },
    })
    state.port = server.port
    closeServer = server.close
  } catch (err) {
    process.stderr.write('fin14: failed to start server: ' + err.message + '\n')
    process.exit(1)
  }

  const tui = startTui(state, handleAction)

  let shuttingDown = false
  process.on('SIGINT', () => { if (!shuttingDown) shutdown() })
  process.on('SIGTERM', () => { if (!shuttingDown) shutdown() })

  if (!isTTY) {
    process.stdout.write('fin14 dev  ' + outputDir + '  http://localhost:' + state.port + '\n')
  }

  await triggerMeasure()

  let closeWatcher = null
  const watcherHandle = createWatcher(outputDir, handleBatch)
  closeWatcher = watcherHandle.close

  async function triggerMeasure(options = {}) {
    const isBurst = options.burst === true
    state.measuring = true
    state.status = 'measuring'
    tui.render()

    try {
      const summary = await measureSite(outputDir, config, isBurst ? {
        onStart: ({ total }) => {
          startBurstMeasure(state, total)
          tui.render()
        },
        onPageResult: (page, progress) => {
          recordBurstPage(state, page, progress.done, progress.total)
          tui.render()
        },
      } : {})
      state.summary = summary
      state.measureError = null
      if (isBurst) {
        finishBurst(state)
        const violations = summary.results.filter(page => page.status !== 'pass')
        state.mode = violations.length > 0 ? 'violations' : 'pages'
        state.page = 0
        state.cursor = 0
      }
      pushActivity(state, {
        type: 'measure',
        message: summary.pass + ' pass  ' + summary.warn + ' warn  ' + summary.fail + ' fail  ' + summary.pages + ' pages',
        ts: Date.now(),
      })
      pool.broadcast('summary', { ...summary, hiddenWarnings: [...state.hiddenWarnings], cutCandidateMinBytes: config.budget?.cut_candidate_min_bytes ?? 2800 })
      if (!isTTY) {
        process.stdout.write(
          'pass ' + summary.pass + '  warn ' + summary.warn +
          '  fail ' + summary.fail + '  ' + summary.pages + ' pages\n'
        )
      }
    } catch (err) {
      state.measureError = err.message
      if (isBurst) finishBurst(state)
      pushActivity(state, { type: 'error', message: err.message, ts: Date.now() })
      pool.broadcast('error', { message: err.message })
      if (!isTTY) process.stderr.write('error  ' + err.message + '\n')
    } finally {
      state.measuring = false
      state.status = 'watching'
      tui.render()
    }
  }

  async function handleBatch(paths) {
    if (state.measuring || state.rebuilding) return
    state.lastBatchPaths = normalizeChangedPaths(outputDir, paths)
    beginBurst(state, state.lastBatchPaths.length)
    const settleMs = computeSettleMs(state)
    state.currentSettleMs = settleMs
    state.status = 'settling'
    tui.render()
    await sleep(settleMs)
    await triggerMeasure({ burst: true })
  }

  async function handleRebuild() {
    if (!config.project?.build_command) {
      pushActivity(state, { type: 'info', message: 'no build_command configured', ts: Date.now() })
      tui.render()
      return
    }
    if (state.rebuilding || state.measuring) return
    state.rebuilding = true
    state.status = 'rebuilding'
    pool.broadcast('rebuilding', {})
    tui.render()

    const buildStart = Date.now()
    const code = await runBuildDev(config.project.build_command, isTTY)
    const buildMs = Date.now() - buildStart
    state.rebuilding = false

    if (code === 0) {
      recordBuildTime(state, buildMs)
      pushActivity(state, { type: 'rebuild', message: 'build succeeded (' + (buildMs / 1000).toFixed(1) + 's)', ts: Date.now() })
      const settleMs = computeSettleMs(state)
      state.currentSettleMs = settleMs
      beginBurst(state, 0)
      state.status = 'settling'
      tui.render()
      await sleep(settleMs)
      await triggerMeasure({ burst: true })
    } else {
      state.rebuildError = 'build failed (exit ' + code + ')'
      pushActivity(state, { type: 'error', message: state.rebuildError, ts: Date.now() })
      let dirExists = false
      try { await stat(outputDir); dirExists = true } catch {}
      if (dirExists && state.summary) {
        state.summary.siteWarnings.push({
          code: 'E19',
          message: 'build_command failed — budget measured from stale output',
          strictFailure: true,
        })
        await triggerMeasure()
      } else {
        state.status = 'error'
        tui.render()
      }
    }
  }

  function handleAction(action) {
    if (action === ACTIONS.QUIT) { shutdown(); return }
    if (action === ACTIONS.REBUILD) { handleRebuild(); return }
    if (action === ACTIONS.ESC) {
      state.mode = 'pages'
      state.detailPageFile = null
      tui.renderNow()
      return
    }
    if (action === ACTIONS.FILTERS) {
      state.mode = state.mode === 'filters' ? 'pages' : 'filters'
      state.filtersCursor = 0
      tui.renderNow()
      return
    }
    if (action === ACTIONS.SPACE) {
      if (state.mode === 'filters') {
        const item = ALL_WARNINGS[state.filtersCursor]
        if (item) {
          const code = item.code
          if (state.hiddenWarnings.has(code)) state.hiddenWarnings.delete(code)
          else state.hiddenWarnings.add(code)
          tui.renderNow()
          if (state.summary) {
            pool.broadcast('summary', { ...state.summary, hiddenWarnings: [...state.hiddenWarnings], cutCandidateMinBytes: config.budget?.cut_candidate_min_bytes ?? 2800 })
          }
        }
      }
      return
    }
    if (action === ACTIONS.UP) {
      if (state.mode === 'filters') {
        state.filtersCursor = Math.max(0, state.filtersCursor - 1)
        tui.renderNow()
        return
      }
      const rows = process.stdout.rows || 24
      const pageRows = visiblePageRows(state, rows)
      state.cursor = Math.max(0, state.cursor - 1)
      if (pageRows.length > 0) state.cursor = Math.min(state.cursor, pageRows.length - 1)
      tui.renderNow()
      return
    }
    if (action === ACTIONS.DOWN) {
      if (state.mode === 'filters') {
        state.filtersCursor = Math.min(ALL_WARNINGS.length - 1, state.filtersCursor + 1)
        tui.renderNow()
        return
      }
      const rows = process.stdout.rows || 24
      const pageRows = visiblePageRows(state, rows)
      const max = Math.max(0, pageRows.length - 1)
      state.cursor = Math.min(max, state.cursor + 1)
      tui.renderNow()
      return
    }
    if (action === ACTIONS.LEFT) {
      state.page = Math.max(0, state.page - 1)
      state.cursor = 0
      tui.renderNow()
      return
    }
    if (action === ACTIONS.RIGHT) {
      const rows = process.stdout.rows || 24
      state.page = Math.min(pageCount(state, rows) - 1, state.page + 1)
      state.cursor = 0
      tui.renderNow()
      return
    }
    if (action === ACTIONS.ENTER) {
      const rows = process.stdout.rows || 24
      const pageRows = visiblePageRows(state, rows)
      const selected = pageRows[state.cursor]
      if (selected) {
        if (state.mode === 'detail' && state.detailPageFile === selected.file) {
          state.mode = 'pages'
          state.detailPageFile = null
        } else {
          state.mode = 'detail'
          state.detailPageFile = selected.file
        }
        tui.renderNow()
      }
      return
    }
  }

  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    state.status = 'stopping'
    try { if (closeWatcher) await closeWatcher() } catch {}
    tui.stop()
    pool.close()
    try { await closeServer() } catch {}
    process.exit(0)
  }
}

function runBuildDev(command, isTTY) {
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, stdio: isTTY ? 'pipe' : 'inherit' })
    proc.on('close', code => resolve(code ?? 1))
    proc.on('error', () => resolve(1))
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function normalizeChangedPaths(outputDir, paths) {
  return paths.map(path => {
    const raw = String(path)
    let rel = raw
    if (isAbsolute(raw)) {
      rel = relative(outputDir, raw)
    } else if (raw === outputDir || raw.startsWith(outputDir + '/') || raw.startsWith(outputDir + '\\')) {
      rel = relative(outputDir, raw)
    }
    return rel.replace(/\\/g, '/').replace(/^\.\//, '')
  })
}
