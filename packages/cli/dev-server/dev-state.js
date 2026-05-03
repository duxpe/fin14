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
    currentSettleMs: 2000,
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
  if (state.buildTimes.length === 0) return 2000;
  const avg = state.buildTimes.reduce((a, b) => a + b, 0) / state.buildTimes.length;
  return Math.max(200, Math.min(5000, Math.round(avg * 0.5)));
}

export function recordBuildTime(state, buildMs) {
  state.buildTimes.push(buildMs);
  if (state.buildTimes.length > 10) state.buildTimes = state.buildTimes.slice(-10);
  state.cycleCount++;
}

export function recordCycle(state, _ms) {
  // no-op — settle is learned from build_command duration via recordBuildTime
}

export function pushActivity(state, entry) {
  state.activity.push(entry);
  if (state.activity.length > 20) state.activity = state.activity.slice(-20);
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

export function clearBurst(state) {
  state.burst = {
    active: false,
    stage: null,
    changed: 0,
    total: 0,
    done: 0,
    violations: [],
  };
}

export function topOffenders(state) {
  return state.summary?.topAssets.slice(0, 3) ?? [];
}

export function hintLine(state) {
  if (state.summary === null) return '';
  const { fail, warn, pages, topAssets } = state.summary;
  if (fail === 0 && warn === 0) return 'all pages within budget';
  if (fail > 0 && fail / pages >= 0.3) return 'many pages over budget — check shared template or global CSS';
  if (fail > 0) {
    const top = topAssets?.[0];
    return `${fail} page${fail !== 1 ? 's' : ''} over budget${top ? ` — ${top.displayPath} is heaviest` : ''}`;
  }
  if (warn > 0) return `${warn} page${warn !== 1 ? 's' : ''} with warnings`;
  return '';
}
