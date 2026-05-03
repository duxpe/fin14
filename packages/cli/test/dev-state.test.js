import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  beginBurst,
  computeSettleMs,
  finishBurst,
  recordCycle,
  recordBuildTime,
  recordBurstPage,
  startBurstMeasure,
  pushActivity,
  topOffenders,
  hintLine,
} from '../dev-server/dev-state.js';
import {
  ACTIVITY_LIMIT,
  BUILD_TIME_SAMPLE_LIMIT,
  SETTLE_INITIAL_MS,
  SETTLE_MAX_MS,
  SETTLE_MIN_MS,
  SYSTEMIC_FAIL_RATIO,
  TOP_OFFENDER_LIMIT,
} from '../dev-server/constants.js';

describe('createState', () => {
  it('returns correct initial shape', () => {
    const state = createState('/out', { budget: 14 }, true);
    assert.equal(state.outputDir, '/out');
    assert.deepEqual(state.config, { budget: 14 });
    assert.equal(state.isTTY, true);
    assert.equal(state.port, 0);
    assert.equal(state.status, 'starting');
    assert.equal(state.summary, null);
    assert.equal(state.measuring, false);
    assert.equal(state.measureError, null);
    assert.equal(state.rebuilding, false);
    assert.equal(state.rebuildError, null);
    assert.equal(state.cycleCount, 0);
    assert.deepEqual(state.buildTimes, []);
    assert.equal(state.currentSettleMs, SETTLE_INITIAL_MS);
    assert.deepEqual(state.activity, []);
    assert.equal(state.cursor, 0);
    assert.equal(state.mode, 'pages');
    assert.equal(state.page, 0);
    assert.deepEqual(state.lastBatchPaths, []);
    assert.equal(state.detailPageFile, null);
    assert.ok(state.hiddenWarnings instanceof Set, 'hiddenWarnings should be a Set');
    assert.equal(state.hiddenWarnings.size, 0);
    assert.equal(state.filtersCursor, 0);
    assert.deepEqual(state.burst, {
      active: false,
      stage: null,
      changed: 0,
      total: 0,
      done: 0,
      violations: [],
    });
  });
});

describe('computeSettleMs', () => {
  it('returns initial settle delay when no build times recorded', () => {
    const state = createState('', {}, false);
    assert.equal(computeSettleMs(state), SETTLE_INITIAL_MS);
  });

  it('returns avg*0.5 rounded when buildTimes set', () => {
    const state = createState('', {}, false);
    state.buildTimes = [1000, 2000, 3000];
    assert.equal(computeSettleMs(state), 1000);
  });

  it('clamps to 200 minimum', () => {
    const state = createState('', {}, false);
    state.buildTimes = [10, 10, 10];
    assert.ok(computeSettleMs(state) >= SETTLE_MIN_MS);
  });

  it('clamps to 5000 maximum', () => {
    const state = createState('', {}, false);
    state.buildTimes = [12000, 12000, 12000];
    assert.ok(computeSettleMs(state) <= SETTLE_MAX_MS);
  });

  it('fast build times produce settle near floor', () => {
    const state = createState('', {}, false);
    state.buildTimes = [300, 310, 290, 305, 295];
    assert.ok(computeSettleMs(state) < 500, `expected < 500 but got ${computeSettleMs(state)}`);
    assert.ok(computeSettleMs(state) >= SETTLE_MIN_MS);
  });

  it('repeated same build times produce stable settle', () => {
    const state = createState('', {}, false);
    state.buildTimes = [400, 400, 400];
    const first = computeSettleMs(state);
    recordBuildTime(state, 400);
    const second = computeSettleMs(state);
    assert.equal(first, second, 'settle stable with identical build times');
  });
});

describe('recordCycle', () => {
  it('is a no-op (does not mutate state)', () => {
    const state = createState('', {}, false);
    recordCycle(state, 500);
    assert.equal(state.cycleCount, 0);
    assert.deepEqual(state.buildTimes, []);
  });
});

describe('recordBuildTime', () => {
  it('increments cycleCount and pushes to buildTimes', () => {
    const state = createState('', {}, false);
    recordBuildTime(state, 1200);
    assert.equal(state.cycleCount, 1);
    assert.deepEqual(state.buildTimes, [1200]);
  });

  it('trims buildTimes to the configured sample limit', () => {
    const state = createState('', {}, false);
    for (let i = 0; i < 12; i++) recordBuildTime(state, i * 100);
    assert.equal(state.buildTimes.length, BUILD_TIME_SAMPLE_LIMIT);
    assert.equal(state.buildTimes[0], (12 - BUILD_TIME_SAMPLE_LIMIT) * 100);
    assert.equal(state.buildTimes[BUILD_TIME_SAMPLE_LIMIT - 1], 1100);
  });
});

describe('pushActivity', () => {
  it('adds entry and trims to the configured activity limit', () => {
    const state = createState('', {}, false);
    for (let i = 0; i < 22; i++) {
      pushActivity(state, { type: 'info', message: `msg ${i}`, ts: i });
    }
    assert.equal(state.activity.length, ACTIVITY_LIMIT);
    assert.equal(state.activity[0].message, `msg ${22 - ACTIVITY_LIMIT}`);
    assert.equal(state.activity[ACTIVITY_LIMIT - 1].message, 'msg 21');
  });
});

describe('burst state', () => {
  it('tracks burst lifecycle and violations', () => {
    const state = createState('', {}, false);
    beginBurst(state, 3);
    assert.equal(state.burst.active, true);
    assert.equal(state.burst.stage, 'settling');
    assert.equal(state.burst.changed, 3);

    startBurstMeasure(state, 2);
    assert.equal(state.burst.stage, 'measuring');
    assert.equal(state.burst.total, 2);

    recordBurstPage(state, { file: 'ok.html', status: 'pass' }, 1, 2);
    assert.equal(state.burst.violations.length, 0);
    recordBurstPage(state, { file: 'warn.html', status: 'warn' }, 2, 2);
    assert.equal(state.burst.done, 2);
    assert.equal(state.burst.violations.length, 1);

    finishBurst(state);
    assert.equal(state.burst.active, false);
    assert.equal(state.burst.stage, null);
  });
});

describe('topOffenders', () => {
  it('returns [] when summary is null', () => {
    const state = createState('', {}, false);
    assert.deepEqual(topOffenders(state), []);
  });

  it('returns configured number of topAssets', () => {
    const state = createState('', {}, false);
    const assets = ['a', 'b', 'c', 'd', 'e'];
    state.summary = { topAssets: assets, fail: 0, warn: 0, pages: 5 };
    assert.deepEqual(topOffenders(state), assets.slice(0, TOP_OFFENDER_LIMIT));
  });
});

describe('hintLine', () => {
  it('returns empty string when summary is null', () => {
    const state = createState('', {}, false);
    assert.equal(hintLine(state), '');
  });

  it('returns all pages within budget when fail=0 and warn=0', () => {
    const state = createState('', {}, false);
    state.summary = { fail: 0, warn: 0, pages: 5, topAssets: [] };
    assert.equal(hintLine(state), 'all pages within budget');
  });

  it('returns systemic hint when fail/pages reaches configured ratio', () => {
    const state = createState('', {}, false);
    state.summary = { fail: SYSTEMIC_FAIL_RATIO * 10, warn: 0, pages: 10, topAssets: [] };
    const hint = hintLine(state);
    assert.ok(hint.includes('template') || hint.includes('global CSS'), `unexpected: ${hint}`);
  });

  it('returns per-page hint when fail > 0 but < 30%', () => {
    const state = createState('', {}, false);
    state.summary = { fail: 1, warn: 0, pages: 10, topAssets: [{ displayPath: 'styles.css' }] };
    const hint = hintLine(state);
    assert.ok(hint.includes('1 page'), `unexpected: ${hint}`);
    assert.ok(hint.includes('styles.css'), `unexpected: ${hint}`);
  });
});
