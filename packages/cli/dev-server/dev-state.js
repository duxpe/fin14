import {
  ACTIVITY_LIMIT,
  BUILD_TIME_SAMPLE_LIMIT,
  SETTLE_BUILD_FACTOR,
  SETTLE_INITIAL_MS,
  SETTLE_MAX_MS,
  SETTLE_MIN_MS,
  SYSTEMIC_FAIL_RATIO,
  TOP_OFFENDER_LIMIT,
} from './constants.js'

export function createState(outputDir, config, isTTY) {
  return {
    outputDir,
    config,
    isTTY,
    port: 0,
    status: 'starting',
    summary: null,
    measuring: false,
    measureError: null,
    rebuilding: false,
    rebuildError: null,
    cycleCount: 0,
    buildTimes: [],
    currentSettleMs: SETTLE_INITIAL_MS,
    activity: [],
    cursor: 0,
    mode: 'pages',
    page: 0,
    lastBatchPaths: [],
    detailPageFile: null,
    hiddenWarnings: new Set(),
    filtersCursor: 0,
    burst: {
      active: false,
      stage: null,
      changed: 0,
      total: 0,
      done: 0,
      violations: [],
    },
  };
}

export function computeSettleMs(state) {
  if (state.buildTimes.length === 0) return SETTLE_INITIAL_MS;
  const avg = state.buildTimes.reduce((a, b) => a + b, 0) / state.buildTimes.length;
  return Math.max(SETTLE_MIN_MS, Math.min(SETTLE_MAX_MS, Math.round(avg * SETTLE_BUILD_FACTOR)));
}

export function recordBuildTime(state, buildMs) {
  state.buildTimes.push(buildMs);
  if (state.buildTimes.length > BUILD_TIME_SAMPLE_LIMIT) state.buildTimes = state.buildTimes.slice(-BUILD_TIME_SAMPLE_LIMIT);
  state.cycleCount++;
}

export function pushActivity(state, entry) {
  state.activity.push(entry);
  if (state.activity.length > ACTIVITY_LIMIT) state.activity = state.activity.slice(-ACTIVITY_LIMIT);
}

export function beginBurst(state, changed) {
  state.burst = {
    active: true,
    stage: 'settling',
    changed,
    total: 0,
    done: 0,
    violations: [],
  };
}

export function startBurstMeasure(state, total) {
  state.burst.active = true;
  state.burst.stage = 'measuring';
  state.burst.total = total;
  state.burst.done = 0;
  state.burst.violations = [];
}

export function recordBurstPage(state, page, done, total) {
  state.burst.active = true;
  state.burst.stage = 'measuring';
  state.burst.done = done;
  state.burst.total = total;
  if (page.status !== 'pass') {
    state.burst.violations.push(page);
  }
}

export function finishBurst(state) {
  state.burst.active = false;
  state.burst.stage = null;
}

export function topOffenders(state) {
  return state.summary?.topAssets.slice(0, TOP_OFFENDER_LIMIT) ?? [];
}

export function hintLine(state) {
  if (state.summary === null) return '';
  const { fail, warn, pages, topAssets } = state.summary;
  if (fail === 0 && warn === 0) return 'all pages within budget';
  if (fail > 0 && fail / pages >= SYSTEMIC_FAIL_RATIO) return 'many pages over budget — check shared template or global CSS';
  if (fail > 0) {
    const top = topAssets?.[0];
    return `${fail} page${fail !== 1 ? 's' : ''} over budget${top ? ` — ${top.displayPath} is heaviest` : ''}`;
  }
  if (warn > 0) return `${warn} page${warn !== 1 ? 's' : ''} with warnings`;
  return '';
}
