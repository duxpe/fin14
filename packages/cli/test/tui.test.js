import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createState, pushActivity } from '../dev-server/dev-state.js'
import { startTui, ACTIONS, buildFrame, visiblePageRows, pageCount, formatPageRow, paintFrame, nextViewFilter, VIEW_FILTERS, PRESET_ITEMS, filtersItemCount } from '../dev-server/tui.js'

function makeState(overrides = {}) {
  const state = createState('/tmp/dist', {}, false)
  state.port = 4214
  state.status = 'watching'
  Object.assign(state, overrides)
  return state
}

describe('ACTIONS', () => {
  it('has keyboard action keys', () => {
    assert.equal(ACTIONS.QUIT, 'quit')
    assert.equal(ACTIONS.REBUILD, 'rebuild')
    assert.equal(ACTIONS.UP, 'up')
    assert.equal(ACTIONS.DOWN, 'down')
    assert.equal(ACTIONS.LEFT, 'left')
    assert.equal(ACTIONS.RIGHT, 'right')
    assert.equal(ACTIONS.ENTER, 'enter')
    assert.equal(ACTIONS.ESC, 'esc')
    assert.equal(ACTIONS.SPACE, 'space')
    assert.equal(ACTIONS.FILTERS, 'filters')
    assert.equal(ACTIONS.CYCLE_VIEW, 'cycleView')
  })
})

describe('nextViewFilter', () => {
  it('cycles all → violations → budget → all', () => {
    assert.deepEqual(VIEW_FILTERS, ['all', 'violations', 'budget'])
    assert.equal(nextViewFilter('all'), 'violations')
    assert.equal(nextViewFilter('violations'), 'budget')
    assert.equal(nextViewFilter('budget'), 'all')
  })
})

describe('ignore presets', () => {
  function nextSummary() {
    const results = [{
      file: 'index.html', status: 'fail', overBudget: true, totalBytes: 80000, limitBytes: 14000,
      warnings: [], cutCandidates: [],
      resources: [
        { key: 'index.html', displayPath: 'index.html', group: 'html', bytes: 5000 },
        { key: '_next/static/chunks/a.js', displayPath: '_next/static/chunks/a.js', group: 'js', bytes: 75000 },
      ],
    }]
    return { outputDir: 'out', pages: 1, pass: 0, warn: 0, fail: 1, totalBytes: 80000, topAssets: [], siteWarnings: [], results }
  }

  it('PRESET_ITEMS includes the nextjs preset; filtersItemCount counts presets + warnings', () => {
    assert.ok(PRESET_ITEMS.some(p => p.id === 'nextjs'))
    assert.equal(filtersItemCount(), PRESET_ITEMS.length + 10)
  })

  it('pages screen shows the Next.js band when detected and preset inactive', () => {
    const s = nextSummary()
    const state = makeState({ summary: s, rawSummary: s, frameworkDetected: 'nextjs', mode: 'pages' })
    const frame = buildFrame(state, 80, 24, false).join('\n')
    assert.ok(frame.includes('Next.js detected'))
    assert.ok(frame.includes('press F'))
  })

  it('band hidden once the preset is active', () => {
    const s = nextSummary()
    const state = makeState({ summary: s, rawSummary: s, frameworkDetected: 'nextjs', mode: 'pages', activePresets: new Set(['nextjs']) })
    const frame = buildFrame(state, 80, 24, false).join('\n')
    assert.ok(!frame.includes('Next.js detected'))
  })

  it('F screen lists the ignore presets section and warning filters', () => {
    const s = nextSummary()
    const state = makeState({ summary: s, rawSummary: s, frameworkDetected: 'nextjs', mode: 'filters', filtersCursor: 0 })
    const frame = buildFrame(state, 80, 24, false).join('\n')
    assert.ok(frame.includes('ignore presets'))
    assert.ok(frame.includes('Next.js client JS'))
    assert.ok(frame.includes('[ ]'))
    assert.ok(frame.includes('warning filters'))
  })

  it('F screen marks active preset with [x]', () => {
    const s = nextSummary()
    const state = makeState({ summary: s, rawSummary: s, frameworkDetected: 'nextjs', mode: 'filters', activePresets: new Set(['nextjs']) })
    const frame = buildFrame(state, 80, 24, false).join('\n')
    assert.ok(frame.includes('[x]'))
  })
})

describe('startTui non-TTY', () => {
  it('returns render and stop functions', () => {
    const state = makeState()
    const tui = startTui(state, () => {})
    assert.equal(typeof tui.render, 'function')
    assert.equal(typeof tui.stop, 'function')
  })

  it('render is callable with no error', () => {
    const state = makeState()
    const tui = startTui(state, () => {})
    assert.doesNotThrow(() => tui.render())
  })

  it('stop is callable with no error', () => {
    const state = makeState()
    const tui = startTui(state, () => {})
    assert.doesNotThrow(() => tui.stop())
  })

  it('onAction is never called without input', () => {
    const state = makeState()
    let called = false
    startTui(state, () => { called = true })
    assert.equal(called, false)
  })
})

describe('paintFrame', () => {
  it('clears the previous frame before writing the next one', () => {
    const calls = []
    const stdout = {
      cursorTo(x, y) { calls.push(['cursorTo', x, y]) },
      clearScreenDown() { calls.push(['clearScreenDown']) },
      write(text) { calls.push(['write', text]) },
    }

    paintFrame(stdout, ['short', 'frame'])

    assert.deepEqual(calls, [
      ['cursorTo', 0, 0],
      ['clearScreenDown'],
      ['write', 'short\nframe'],
    ])
  })
})

describe('buildFrame', () => {
  const WIDTH = 80
  const ROWS = 24

  it('line 0 contains fin14 and outputDir', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[0].includes('fin14'), `line0: ${lines[0]}`)
    assert.ok(lines[0].includes('/tmp/dist'), `line0: ${lines[0]}`)
  })

  it('line 0 contains status watching', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[0].includes('watching'), `line0: ${lines[0]}`)
  })

  it('line 1 contains report URL', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[1].includes('http://localhost:4214'), `line1: ${lines[1]}`)
  })

  it('line 2 is a separator of ─ chars', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[2].length > 0)
    assert.ok([...lines[2]].every(c => c === '─'), `line2: ${lines[2]}`)
  })

  it('line 3 contains top offenders and none when no summary', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[3].includes('top offenders'), `line3: ${lines[3]}`)
    assert.ok(lines[3].includes('none'), `line3: ${lines[3]}`)
  })

  it('line 3 contains asset displayPath when summary has topAssets', () => {
    const state = makeState()
    state.summary = {
      topAssets: [{ displayPath: 'styles.css', bytes: 5000 }],
      pass: 1, warn: 0, fail: 0, pages: 1,
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[3].includes('styles.css'), `line3: ${lines[3]}`)
  })

  it('line 4 contains hint', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[4].includes('hint'), `line4: ${lines[4]}`)
  })

  it('last line contains R rebuild and Q quit', () => {
    const state = makeState()
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const last = lines[lines.length - 1]
    assert.ok(last.includes('R rebuild'), `last: ${last}`)
    assert.ok(last.includes('Q quit'), `last: ${last}`)
  })

  it('no line longer than width=60', () => {
    const state = makeState()
    state.summary = {
      topAssets: [
        { displayPath: 'a-very-long-asset-name-that-exceeds-limit.css', bytes: 12345 },
        { displayPath: 'another-long-file.js', bytes: 9000 },
        { displayPath: 'yet-another-file.png', bytes: 7000 },
      ],
      pass: 1, warn: 2, fail: 3, pages: 10,
    }
    pushActivity(state, { type: 'info', message: 'a'.repeat(80), ts: Date.now() })
    const lines = buildFrame(state, 60, ROWS, false)
    for (const line of lines) {
      assert.ok(line.length <= 60, `line too long (${line.length}): ${line}`)
    }
  })

  function passSummary(pages) {
    return {
      topAssets: [], pass: pages, warn: 0, fail: 0, pages,
      results: Array.from({ length: pages }, (_, i) => ({
        file: `p${i}.html`, totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [],
      })),
    }
  }

  it('build result shows as a transient band above the footer, without measure counts', () => {
    const state = makeState()
    state.summary = passSummary(9)
    pushActivity(state, { type: 'rebuild', message: 'build succeeded (0.3s)', ts: Date.now() })
    pushActivity(state, { type: 'measure', message: '9 pass  0 warn  0 fail  9 pages', ts: Date.now() })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const last = lines.length - 1
    assert.ok(lines[last].includes('R rebuild'), `footer: ${lines[last]}`)
    const band = lines[last - 2]
    assert.ok(band.includes('build succeeded (0.3s)'), `band: ${band}`)
    assert.ok(!band.includes('pass'), `band leaked measure counts: ${band}`)
    assert.ok([...lines[last - 1]].every(c => c === '─'), 'separator below band')
    assert.ok([...lines[last - 3]].every(c => c === '─'), 'separator above band')
  })

  it('shows an info notice (no build_command) in the band', () => {
    const state = makeState()
    state.summary = passSummary(2)
    pushActivity(state, { type: 'info', message: 'no build_command configured', ts: Date.now() })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const band = lines[lines.length - 3]
    assert.ok(band.includes('no build_command configured'), `band: ${band}`)
  })

  it('a measure on its own (file-watch, no build) shows no band', () => {
    const state = makeState()
    state.summary = passSummary(9)
    pushActivity(state, { type: 'measure', message: '9 pass  0 warn  0 fail  9 pages', ts: Date.now() })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const last = lines.length - 1
    assert.ok(lines[last].includes('R rebuild'), `footer: ${lines[last]}`)
    assert.ok([...lines[last - 1]].every(c => c === '─'), 'no band: separator directly above footer')
  })

  it('stale activity (older than the toast window) is not shown', () => {
    const state = makeState()
    state.summary = passSummary(9)
    pushActivity(state, { type: 'rebuild', message: 'build succeeded (0.0s)', ts: Date.now() - 10000 })
    const joined = buildFrame(state, WIDTH, ROWS, false).join('\n')
    assert.ok(!joined.includes('build succeeded'), `frame: ${joined}`)
  })

  it('detail view shows no activity log', () => {
    const state = makeState({ mode: 'detail', detailPageFile: 'p0.html' })
    state.summary = {
      topAssets: [], pass: 1, warn: 0, fail: 0, pages: 1,
      results: [{ file: 'p0.html', totalBytes: 6600, limitBytes: 14000, status: 'pass', resources: [{ group: 'html', bytes: 6600 }], warnings: [] }],
    }
    pushActivity(state, { type: 'rebuild', message: 'build succeeded (0.0s)', ts: Date.now() })
    const joined = buildFrame(state, WIDTH, ROWS, false).join('\n')
    assert.ok(joined.includes('detail: p0.html'), `frame: ${joined}`)
    assert.ok(!joined.includes('build succeeded'), `detail leaked log: ${joined}`)
  })

  it('an active burst suppresses the transient band', () => {
    const state = makeState()
    state.burst = { active: true, stage: 'measuring', changed: 0, total: 9, done: 9, violations: [] }
    state.summary = passSummary(9)
    pushActivity(state, { type: 'rebuild', message: 'build succeeded (0.3s)', ts: Date.now() })
    const joined = buildFrame(state, WIDTH, ROWS, false).join('\n')
    assert.ok(!joined.includes('build succeeded'), `band shown during burst: ${joined}`)
  })

  it('stays within terminal rows when the transient band is active', () => {
    const state = makeState()
    state.summary = passSummary(30)
    pushActivity(state, { type: 'rebuild', message: 'build succeeded (0.3s)', ts: Date.now() })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines.length <= ROWS, `expected <= ${ROWS} rows, got ${lines.length}`)
    assert.ok(lines.join('\n').includes('build succeeded (0.3s)'), 'band should be visible')
  })

  it('renders page rows when summary has results', () => {
    const state = makeState()
    state.summary = {
      topAssets: [],
      pass: 2, warn: 1, fail: 0, pages: 3,
      results: [
        { file: 'index.html', totalBytes: 8000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'about.html', totalBytes: 12000, limitBytes: 14000, status: 'warn', resources: [], warnings: [] },
        { file: 'contact.html', totalBytes: 4000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const joined = lines.join('\n')
    assert.ok(joined.includes('index.html') || joined.includes('about.html'), `frame missing page filenames: ${joined}`)
  })

  it('shows cursor marker on selected page row', () => {
    const state = makeState()
    state.cursor = 0
    state.summary = {
      topAssets: [],
      pass: 1, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'index.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'about.html', totalBytes: 6000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const joined = lines.join('\n')
    assert.ok(joined.includes('>'), `frame missing cursor marker '>'`)
  })

  it('cursor on second row marks second page (heavier page sorts first)', () => {
    const state = makeState()
    state.cursor = 1
    state.summary = {
      topAssets: [],
      pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'alpha.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'beta.html', totalBytes: 6000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const selectedLine = lines.find(l => l.startsWith('>'))
    assert.ok(selectedLine, 'no selected line found')
    assert.ok(selectedLine.includes('alpha.html'), `expected alpha.html at index 1 (lighter, sorts second), got: ${selectedLine}`)
  })

  it('detail mode shows detail section for selected page', () => {
    const state = makeState()
    state.cursor = 0
    state.mode = 'detail'
    state.detailPageFile = 'index.html'
    state.summary = {
      topAssets: [],
      pass: 1, warn: 0, fail: 0, pages: 1,
      results: [
        {
          file: 'index.html', totalBytes: 5000, limitBytes: 14000, status: 'pass',
          resources: [{ group: 'html', bytes: 5000 }], warnings: [],
        },
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const joined = lines.join('\n')
    assert.ok(joined.includes('detail'), `frame missing 'detail' section: ${joined}`)
    assert.ok(joined.includes('index.html'), `frame missing 'index.html' in detail: ${joined}`)
  })

  it('does not exceed terminal row count when many pages exist', () => {
    const state = makeState()
    state.summary = {
      topAssets: [], pass: 30, warn: 0, fail: 0, pages: 30,
      results: Array.from({ length: 30 }, (_, i) => ({
        file: `page-${i}.html`, totalBytes: 1000 + i, limitBytes: 14000, status: 'pass', resources: [], warnings: [],
      })),
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines.length <= ROWS, `expected <= ${ROWS} rows, got ${lines.length}`)
  })

  it('shows burst progress in hint and only violation rows during active burst', () => {
    const state = makeState()
    state.burst = {
      active: true,
      stage: 'measuring',
      changed: 3,
      total: 10,
      done: 4,
      violations: [
        { file: 'bad.html', totalBytes: 15000, limitBytes: 14000, status: 'fail', overBudget: true, resources: [], warnings: [] },
      ],
    }
    state.summary = {
      topAssets: [], pass: 1, warn: 0, fail: 1, pages: 2,
      results: [
        { file: 'good.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        state.burst.violations[0],
      ],
    }
    const joined = buildFrame(state, WIDTH, ROWS, false).join('\n')
    assert.ok(joined.includes('updating 10 pages'), `missing burst progress: ${joined}`)
    assert.ok(joined.includes('4 / 10'), `missing progress count: ${joined}`)
    assert.ok(joined.includes('bad.html'), `missing violation row: ${joined}`)
    assert.ok(!joined.includes('good.html'), `burst should not show passing rows: ${joined}`)
  })

  it('shows paginated view-filter hint when filtered', () => {
    const state = makeState({ viewFilter: 'violations', page: 1 })
    state.summary = {
      topAssets: [], pass: 0, warn: 20, fail: 0, pages: 20,
      results: Array.from({ length: 20 }, (_, i) => ({
        file: `warn-${i}.html`, totalBytes: 13000 + i, limitBytes: 14000, status: 'warn', resources: [], warnings: [],
      })),
    }
    const joined = buildFrame(state, WIDTH, 12, false).join('\n')
    assert.ok(joined.includes('view: violations + warnings'), `missing header view label: ${joined}`)
    assert.ok(joined.includes('page 2/'), `missing page indicator: ${joined}`)
    assert.ok(joined.includes('← →'), `missing page arrows: ${joined}`)
  })

  it('header shows the active view label and hint shows the count', () => {
    const state = makeState({ viewFilter: 'violations' })
    state.summary = {
      topAssets: [], pass: 5, warn: 0, fail: 1, pages: 6,
      results: [
        { file: 'observatory.html', totalBytes: 17000, limitBytes: 14000, status: 'fail', resources: [], warnings: [] },
        ...Array.from({ length: 5 }, (_, i) => ({
          file: `ok-${i}.html`, totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [],
        })),
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[1].includes('view: violations + warnings'), `header: ${lines[1]}`)
    const hintLine = lines.find(l => l.includes('hint'))
    assert.ok(hintLine.includes('1 of 6 pages'), `hint: ${hintLine}`)
  })

  it('header shows view: all pages in the default view', () => {
    const state = makeState()
    state.summary = {
      topAssets: [], pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'b.html', totalBytes: 6000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[1].includes('view: all pages'), `header: ${lines[1]}`)
  })

  it('footer advertises the Shift+Tab switch-view hint in list view', () => {
    const state = makeState()
    state.summary = {
      topAssets: [], pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'b.html', totalBytes: 6000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const footer = buildFrame(state, 120, ROWS, false).slice(-1)[0]
    assert.ok(footer.includes('Shift+Tab to switch view'), `footer: ${footer}`)
  })

  it('budget view with no failures shows an empty-view message', () => {
    const state = makeState({ viewFilter: 'budget' })
    state.summary = {
      topAssets: [], pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'b.html', totalBytes: 6000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const joined = buildFrame(state, WIDTH, ROWS, false).join('\n')
    assert.ok(joined.includes('no pages in this view'), `frame: ${joined}`)
  })
})

describe('visiblePageRows', () => {
  it('returns [] when summary is null', () => {
    const state = makeState()
    assert.deepEqual(visiblePageRows(state, 24), [])
  })

  it('returns results sorted fail first then warn then pass', () => {
    const state = makeState()
    state.summary = {
      topAssets: [], pass: 1, warn: 1, fail: 1, pages: 3,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'b.html', totalBytes: 6000, limitBytes: 14000, status: 'warn', resources: [], warnings: [] },
        { file: 'c.html', totalBytes: 15000, limitBytes: 14000, status: 'fail', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.equal(rows[0].status, 'fail')
    assert.equal(rows[1].status, 'warn')
    assert.equal(rows[2].status, 'pass')
  })

  it('limits rows to available slots', () => {
    const state = makeState()
    state.summary = {
      topAssets: [], pass: 10, warn: 0, fail: 0, pages: 10,
      results: Array.from({ length: 10 }, (_, i) => ({
        file: `page${i}.html`, totalBytes: 1000, limitBytes: 14000, status: 'pass', resources: [], warnings: [],
      })),
    }
    const rows = visiblePageRows(state, 12)
    assert.ok(rows.length <= 12 - 8)
  })

  it('prioritizes changed pages when lastBatchPaths is set', () => {
    const state = makeState()
    state.lastBatchPaths = ['b.html']
    state.summary = {
      topAssets: [], pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'b.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.equal(rows[0].file, 'b.html')
  })

  it('matches changed pages across path separators', () => {
    const state = makeState()
    state.lastBatchPaths = ['blog\\b.html']
    state.summary = {
      topAssets: [], pass: 2, warn: 0, fail: 0, pages: 2,
      results: [
        { file: 'a.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'blog/b.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.equal(rows[0].file, 'blog/b.html')
  })

  it('returns fail + warn in violations view', () => {
    const state = makeState({ viewFilter: 'violations' })
    state.summary = {
      topAssets: [], pass: 1, warn: 1, fail: 1, pages: 3,
      results: [
        { file: 'pass.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'warn.html', totalBytes: 6000, limitBytes: 14000, status: 'warn', resources: [], warnings: [] },
        { file: 'fail.html', totalBytes: 15000, limitBytes: 14000, status: 'fail', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.deepEqual(rows.map(r => r.status), ['fail', 'warn'])
  })

  it('returns only failures in budget view', () => {
    const state = makeState({ viewFilter: 'budget' })
    state.summary = {
      topAssets: [], pass: 1, warn: 1, fail: 1, pages: 3,
      results: [
        { file: 'pass.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'warn.html', totalBytes: 6000, limitBytes: 14000, status: 'warn', resources: [], warnings: [] },
        { file: 'fail.html', totalBytes: 15000, limitBytes: 14000, status: 'fail', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.deepEqual(rows.map(r => r.status), ['fail'])
  })

  it('returns all pages in all view', () => {
    const state = makeState({ viewFilter: 'all' })
    state.summary = {
      topAssets: [], pass: 1, warn: 1, fail: 1, pages: 3,
      results: [
        { file: 'pass.html', totalBytes: 5000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] },
        { file: 'warn.html', totalBytes: 6000, limitBytes: 14000, status: 'warn', resources: [], warnings: [] },
        { file: 'fail.html', totalBytes: 15000, limitBytes: 14000, status: 'fail', resources: [], warnings: [] },
      ],
    }
    const rows = visiblePageRows(state, 24)
    assert.equal(rows.length, 3)
  })

  it('uses state.page to paginate visible rows', () => {
    const state = makeState({ page: 1 })
    state.summary = {
      topAssets: [], pass: 10, warn: 0, fail: 0, pages: 10,
      results: Array.from({ length: 10 }, (_, i) => ({
        file: `page${i}.html`, totalBytes: 1000 + i, limitBytes: 14000, status: 'pass', resources: [], warnings: [],
      })),
    }
    assert.ok(pageCount(state, 12) > 1)
    const rows = visiblePageRows(state, 12)
    assert.ok(!rows.some(r => r.file === 'page9.html'), 'first page item should not repeat on second page')
  })
})

describe('formatPageRow', () => {
  it('includes status symbol, bytes, and file', () => {
    const page = { file: 'index.html', totalBytes: 8000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] }
    const line = formatPageRow(page, 80, false, false)
    assert.ok(line.includes('✓'), `missing pass symbol: ${line}`)
    assert.ok(line.includes('index.html'), `missing file: ${line}`)
    assert.ok(line.includes('8.0 / 14.0 kB'), `missing bytes: ${line}`)
  })

  it('shows > marker when selected', () => {
    const page = { file: 'index.html', totalBytes: 8000, limitBytes: 14000, status: 'pass', resources: [], warnings: [] }
    const selected = formatPageRow(page, 80, true, false)
    const notSelected = formatPageRow(page, 80, false, false)
    assert.ok(selected.startsWith('>'), `selected should start with >: ${selected}`)
    assert.ok(!notSelected.startsWith('>'), `not selected should not start with >: ${notSelected}`)
  })

  it('does not exceed width', () => {
    const page = { file: 'a-very-long-page-filename-that-goes-on-forever.html', totalBytes: 12345, limitBytes: 14000, status: 'warn', resources: [], warnings: [] }
    const line = formatPageRow(page, 40, false, false)
    assert.ok(line.length <= 40, `line too long: ${line.length}: ${line}`)
  })
})
