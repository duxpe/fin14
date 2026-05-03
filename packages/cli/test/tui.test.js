import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createState, pushActivity } from '../dev-server/dev-state.js'
import { startTui, ACTIONS, buildFrame, visiblePageRows, pageCount, formatPageRow, paintFrame } from '../dev-server/tui.js'

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

  it('line 1 does not contain settle when status is watching', () => {
    const state = makeState({ status: 'watching' })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(!lines[1].includes('settle'), `line1: ${lines[1]}`)
  })

  it('line 1 contains settle when status is settling', () => {
    const state = makeState({ status: 'settling', currentSettleMs: 1500 })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    assert.ok(lines[1].includes('settle'), `line1: ${lines[1]}`)
    assert.ok(lines[1].includes('1500ms'), `line1: ${lines[1]}`)
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
    for (let i = 0; i < 15; i++) {
      pushActivity(state, { type: 'info', message: 'a'.repeat(80), ts: i })
    }
    const lines = buildFrame(state, 60, ROWS, false)
    for (const line of lines) {
      assert.ok(line.length <= 60, `line too long (${line.length}): ${line}`)
    }
  })

  it('activity messages appear in frame', () => {
    const state = makeState()
    pushActivity(state, { type: 'info', message: 'hello world', ts: 1 })
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const joined = lines.join('\n')
    assert.ok(joined.includes('hello world'), `frame missing activity message`)
  })

  it('activity area shows newest entries', () => {
    const state = makeState()
    for (let i = 0; i < 20; i++) {
      pushActivity(state, { type: 'info', message: `msg-${i}`, ts: i })
    }
    const maxActivity = ROWS - 10
    const lines = buildFrame(state, WIDTH, ROWS, false)
    const joined = lines.join('\n')
    const lastMsg = `msg-${19}`
    assert.ok(joined.includes(lastMsg), `frame missing newest entry: ${lastMsg}`)
    const shown = state.activity.slice(-maxActivity)
    const firstShown = shown[0].message
    assert.ok(joined.includes(firstShown), `frame missing first shown entry: ${firstShown}`)
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

  it('shows violation pagination hint when in violations mode', () => {
    const state = makeState({ mode: 'violations', page: 1 })
    state.summary = {
      topAssets: [], pass: 0, warn: 20, fail: 0, pages: 20,
      results: Array.from({ length: 20 }, (_, i) => ({
        file: `warn-${i}.html`, totalBytes: 13000 + i, limitBytes: 14000, status: 'warn', resources: [], warnings: [],
      })),
    }
    const joined = buildFrame(state, WIDTH, 12, false).join('\n')
    assert.ok(joined.includes('page 2 /'), `missing page indicator: ${joined}`)
    assert.ok(joined.includes('← →'), `missing page arrows: ${joined}`)
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

  it('returns only violations in violations mode', () => {
    const state = makeState({ mode: 'violations' })
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
