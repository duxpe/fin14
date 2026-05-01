# fin14 — Dev Brief

Pre-development orientation: what to learn, what's hard, what's undecided.

---

## What to Study

### Core, non-negotiable

- **Node.js ESM** deeply — `import.meta.url`, no `__dirname`, dynamic imports, monorepo workspace resolution. Trips you up constantly.
- **`zlib` native API** — `gzipSync`, `brotliCompressSync`, buffer handling. Boring but must be exact.
- **Chokidar events** — `add`, `change`, `unlink`, `ready`, debounce patterns, the "ready before add" trap.
- **SSE protocol** — raw HTTP headers, `data:` framing, reconnect behavior, client-side `EventSource`. Simple but specific.
- **Terminal raw mode** — `process.stdin.setRawMode(true)`, keycode buffers, ANSI escape sequences for cursor movement + line clearing. Hardest thing to learn cold.
- **HTML parsing** — understand what libs exist (`node-html-parser`, `parse5`) and their tradeoffs. Need one; no native option.

### Good to understand

- TCP slow start mechanics (explains the WHY of 14kB — explains every design decision)
- HTTP caching headers (for understanding what "first visit" actually means)
- TOML format (need a parser; none chosen yet)

---

## Trickiest Technical Parts

**1. TUI rendering** — hardest by far. Fixed header + dynamic scrolling zone + keyboard input + burst mode progress bar + pagination, all driven by async events. ANSI cursor positioning, `process.stdout.rows` for dynamic height, raw mode for keypresses. One wrong escape code corrupts the whole display. No lib chosen = building this from scratch.

**2. Burst detection + state machine** — Chokidar can fire 500 events in 200ms. Need to: collect events, detect "burst vs. single", hold measurement until burst settles, then transition TUI state from progress → paginated list. The 300ms window works but edge cases accumulate (what if SSG is slow and events keep coming?).

**3. Race condition in watcher flow** — when user runs SSG in Terminal 1 and `fin14 dev` in Terminal 2, Chokidar may fire while SSG is still writing. The 300ms burst window reduces this but doesn't eliminate it. No solution in PRD — could read partial/corrupt files.

**4. `collector.js` correctness** — many edge cases not specified: `<script defer>` in `<body>` (in or out?), `<style>` blocks, CSS `@import` chains, `<link rel="preload">`. Getting this wrong = wrong budget numbers = broken trust.

**5. Performance** — 100 pages in <5s = 50ms/page. External fetches are network I/O and can blow this easily. Concurrency strategy (`Promise.all` with limit) needs thought.

---

## What's Missing from PRD (decide before writing code)

| Gap | Why it matters |
|---|---|
| **HTML parser** | No lib chosen. Zero-dep constraint conflicts with correctness need. Decide: `node-html-parser` vs `parse5` vs regex (bad). |
| **TOML parser** | No lib chosen. Can't read `fin14.toml` without one. `smol-toml` is ~4kB and zero-dep spirit. |
| **CSS `@import` handling** | If `style.css` imports `fonts.css`, those bytes are invisible to budget. Huge correctness gap. |
| **Images in CSS** | `background-image: url(...)` not mentioned. Likely out of scope but should be explicitly decided. |
| **`--strict` warning thresholds** | What triggers "CSS parece grande"? What size threshold? Undefined heuristic. |
| **Concurrency model** | Parallel page measurement: how many at once? External fetches: limit or free? |
| **`audit` output format** | `audit` command mentioned but output never specified (unlike the main command). |
| **Race condition mitigation** | Watcher + SSG still writing = potential corrupt reads. 300ms helps, not fixes. Strategy? |
| **Port conflict** | Port 4214 busy → crash or auto-increment? |
| **Windows/non-Unix support** | Raw mode (`setRawMode`) doesn't exist on Windows without a TTY. Is Windows supported? |
| **Error taxonomy** | Partial list: missing CSS file, fetch timeout, empty output dir, invalid TOML. Need full set + behavior per case. |

---

## Priority Order: Decisions (before coding)

1. **HTML parser** — blocks `collector.js`, blocks everything else
2. **TOML parser** — blocks config loading, blocks CLI startup
3. **CSS `@import` scope** — in or out? Determines correctness bar for v1
4. **`--strict` thresholds** — what heuristics trigger warnings? Document the rule
5. **Concurrency model** — how many pages in parallel? External fetch limit?
6. **Error taxonomy** — enumerate failure modes + expected behavior per case
7. **`audit` output format** — spec it like the main command output is spec'd
8. **Race condition strategy** — accept risk? Add settle delay? Document the choice
9. **Port conflict** — crash or next available? Small but visible UX detail
10. **Windows support** — explicit yes/no. If no, document it and add a guard

---

## Priority Order: Study

1. **TCP slow start + 14kB** — understand the WHY first; shapes every tradeoff
2. **Node.js ESM** — affects every file, every import, monorepo wiring
3. **HTML parsing** — pick the lib, learn its API; `collector.js` is the heart of the tool
4. **`zlib` native API** — `compress.js` is small but must be correct
5. **Chokidar** — `watcher.js` depends on it; debounce behavior is subtle
6. **Terminal raw mode + ANSI** — TUI is the hardest UI component; learn before touching `dev.js`
7. **SSE protocol** — `sse.js` is simple once you know the wire format
8. **TOML** — pick the lib last; lowest complexity, smallest surface area
