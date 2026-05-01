# fin14 - Final Implementation Plan

This is the implementation plan to use. The PRD remains the product source of truth; this file is the engineering guide for building it without letting separate agents invent incompatible contracts.

---

## Build Order

### Phase 0 - Project Skeleton And Config

1. Create npm workspace layout:
   - root `package.json` with `"private": true` and `"workspaces": ["packages/*"]`
   - `packages/core`
   - `packages/cli`
2. Add package metadata for ESM-only Node.js >= 22.
   - root package is never published
   - `packages/core` publishes as `@fin14/core`
   - `packages/cli` publishes as `fin14`
3. Add publication metadata from the start:
   - both packages: `type`, `version`, `description`, `license`, `repository`, `engines`, `files`
   - core: `exports: { ".": "./src/index.js" }`
   - CLI: `bin: { "fin14": "./bin/fin14.js" }`
   - CLI depends on core with a normal semver range when publishing, not a leaked local-only workspace reference
   - include `README.md` and `LICENSE` in publishable packages
4. Add the minimal runtime dependencies:
   - core: `parse5`, `css-tree`, `smol-toml`
   - cli/dev: `chokidar`
5. Implement config loading and normalization before the budget pipeline:
   - explicit `--config <path>`
   - `fin14.toml` from project root
   - command argument overrides config `output_dir`
   - auto-detect output dir only when no dir and no config exist
6. Validate config fields early and fail clearly.

Do not build measurement behavior until normalized config is available.

### Phase 1 - Core Measurement Pipeline

1. `compress.js`
   - pure function: bytes + compression config -> compressed byte count
   - gzip level 6 default
   - brotli supported
2. `crawler.js`
   - recursively find `.html` files under `output_dir`
   - return stable relative paths
   - follow file symlinks, skip directory symlinks
3. `budget/collector.js`
   - parse HTML with `parse5`
   - collect the PRD v1 resource matrix
   - resolve URLs using PRD rules
   - parse CSS with `css-tree`
   - recursively handle static valid `@import`
   - collect first `src:` entry from each `@font-face`
   - deduplicate by canonical key before measurement
4. `budget/external.js`
   - fetch external resources
   - 5s timeout by default
   - max 5 redirects by default
   - 10 concurrent requests per domain
   - `.fin14/cache/` with 1h TTL
5. `budget/measurer.js`
   - read local files or external cached/fetched bodies
   - compress using active config
   - return counted `ResourceResult`s
6. `budget/validator.js`
   - sum counted resources
   - apply 14,000 byte limit
   - produce warnings, status, and cut candidates
7. `core/index.js`
   - expose stable public functions:
     - `loadConfig(options)`
     - `measurePage(file, config)`
     - `measureSite(outputDir, config)`
     - `summarize(results)`

### Phase 2 - CLI

1. `bin/fin14.js`
   - start with `#!/usr/bin/env node`
   - native argv parsing
   - commands: default, `check` alias, `audit`, `dev`
   - global flags: `--config`, `--verbose`
2. `commands/default.js`
   - optional `--build`
   - crawl and measure all pages in batches of 50
   - print concise summary
   - print failures with cut candidates
   - exit only after full measurement
3. `commands/audit.js`
   - mandatory `<file.html>` unless `--all`
   - vertical breakdown matching PRD
   - `--all [dir]` may initially reuse the same per-page audit format plus an aggregate header
4. Strict/force behavior:
   - default: E12 fails, warnings do not
   - `--force`: budget failures exit 0, but input errors still exit 1
   - `--strict`: E13, E14, and E19 also fail

### Phase 3 - Tests And Fixtures

Write tests as the phases are built, not after all code exists.

Required fixture/snapshot coverage:

- basic HTML below and above 14,000 bytes
- gzip level 6 and brotli
- config defaults, invalid config, unknown config field
- output dir detection
- CSS `@import`, missing import, and import cycle
- `@font-face` first `src:` only
- eager images, lazy image order heuristic, `<picture>` fallback, ignored `srcset`
- preload/modulepreload deduplication
- local missing CSS/JS/image warnings
- external fetch success, timeout, redirect, 404, and cache hit
- strict failures for E13, E14, and E19
- CLI default output snapshot
- audit output snapshot
- report/SSE `SiteSummary` snapshot
- package smoke tests:
  - `npm pack --dry-run` for publishable packages
  - packed CLI tarball includes `bin/`, `commands/`, `dev-server/report-ui/`, `README.md`, `LICENSE`, and `package.json`
  - install packed CLI tarball in a temporary fixture project
  - run `npx fin14 --help`
  - run `npx fin14 dist/` against a tiny generated site

### Phase 4 - Dev Mode

Only start after `SiteSummary` is stable and snapshotted.

1. `dev-server/server.js`
   - static report UI
   - port fallback 4214 -> 4215 -> ...
2. `dev-server/sse.js`
   - connection pool
   - broadcast the exact `SiteSummary` shape
3. `dev-server/watcher.js`
   - Chokidar
   - 300ms burst window
   - adaptive settle delay from PRD
4. `commands/dev.js`
   - TUI orchestration
   - R rebuild
   - Q quit
   - no `--strict`, `--force`, or `--build`
5. `dev-server/report-ui/index.html`
   - budget map
   - sorted page list
   - side panel
   - SSE client

---

## Data Contracts

These shapes are intentionally plain JavaScript objects so they can be snapshotted and sent over SSE without transformation.

### ResourceResult

```js
{
  key: string,          // dedup key: absolute fs path for local, full external URL with query and no hash, or stable inline key
  type: 'html' | 'css' | 'js' | 'image' | 'font',
  group: 'html' | 'css' | 'js' | 'images' | 'external',
  path: string,         // absolute fs path, full URL, or inline owner path
  displayPath: string,  // stable human label for CLI/UI
  bytes: number,        // compressed bytes, counted in total
  external: boolean,
  inline: boolean
}
```

Rules:

- `resources[]` contains counted resources only.
- Deduplicated resources go into diagnostics/skipped resources, never into `resources[]`.
- External resources always use `group: 'external'`, even if their implementation `type` is `css`, `js`, `image`, or `font`.
- Local fonts discovered from CSS use `type: 'font'` and `group: 'css'`.
- Inline CSS/JS should use stable keys such as `relative/page.html#style:0` or `relative/page.html#script:0`.

### SkippedResource

```js
{
  key: string,
  type: string,
  displayPath: string,
  reason: 'duplicate' | 'outside_matrix' | 'alternate_font_src' | 'srcset_alternative',
  countedAs?: string
}
```

This is for `--verbose` and debugging. It must not affect totals.

### Warning

```js
{
  code: 'E06' | 'E07' | 'E08' | 'E09' | 'E10' | 'E11' | 'E13' | 'E14' | 'E18' | 'E19',
  message: string,
  path?: string,
  strictFailure: boolean
}
```

`strictFailure` is true for warnings that become errors under `--strict`: E13, E14, E19.

### PageResult

```js
{
  file: string,          // path relative to output_dir
  totalBytes: number,
  limitBytes: number,
  status: 'pass' | 'warn' | 'fail',
  overBudget: boolean,
  unknownBudget: boolean,
  resources: ResourceResult[],
  skippedResources: SkippedResource[],
  warnings: Warning[],
  cutCandidates: ResourceResult[]
}
```

Status rules in normal mode:

- `fail`: `totalBytes > limitBytes`
- `warn`: within budget but has warnings, including E13, E14, E19
- `pass`: within budget and no warnings

`--strict` does not change the stored `status`; it changes command exit behavior.

### SiteSummary

```js
{
  outputDir: string,
  generatedAt: string,   // ISO timestamp
  pages: number,
  pass: number,
  warn: number,
  fail: number,
  totalBytes: number,
  topAssets: ResourceResult[],
  results: PageResult[]
}
```

`SiteSummary` is also the SSE payload. Snapshot it before Phase 4.

---

## Behavioral Rules

### Config Defaults

Defaults when config is absent or a field is missing:

| Field | Default |
|---|---|
| `budget.default` | `14000` bytes |
| `budget.compression` | `"gzip"` |
| `budget.compression_level` | `6` |
| `network.timeout_ms` | `5000` |
| `network.max_redirects` | `5` |
| `viewport.default` | `"mobile"` |
| `viewport.mobile.width` | `390` |
| `viewport.mobile.height` | `844` |
| `viewport.mobile.lazy_visible_images` | `1` |
| `viewport.desktop.width` | `1366` |
| `viewport.desktop.height` | `768` |
| `viewport.desktop.lazy_visible_images` | `1` |

Config validation:

- parse errors: E03
- unknown fields: E04
- invalid values/types: input error, exit 1, with a clear message
- do not silently ignore config fields

### Output Dir Resolution

Priority:

1. explicit command argument
2. `project.output_dir` from config
3. auto-detection from PRD section 6.3
4. E01/error if no valid output dir can be found

### Missing Local Resources

- Missing CSS: E06
- Missing JS: E07
- Missing image: E08
- Missing `@import`: E10

Missing local resources are excluded from the sum. Budget remains known.

### External Resources

- Full URL with query preserved and hash stripped is the canonical key.
- Fetch failures emit E09 and E19.
- Failed external resources are excluded from the sum.
- `unknownBudget` becomes true for that page.
- E14 is emitted for any successfully counted external resource.
- Under `--strict`, E14 and E19 fail the command.

Cache format:

```json
{ "url": "...", "cachedAt": 1714500000, "status": 200, "contentType": "text/css" }
```

Store raw body as `sha1(url).body`. Recompress on every measurement using active config.

Implementation note: Node fetch does not expose the PRD's redirect limit as a simple option. Implement redirect counting explicitly if relying on native `fetch`.

### Deduplication

- Deduplicate before measurement where possible.
- Local key: absolute filesystem path, query ignored, hash ignored.
- External key: full URL, query preserved, hash stripped.
- First occurrence in document order wins the display group.
- Later occurrences become `SkippedResource` with `reason: 'duplicate'`.

### Exit Codes

| Code | Condition |
|---|---|
| `0` | all pages pass/warn without strict failures, or budget failures are ignored by `--force` |
| `1` | input error, any E12 budget failure without `--force`, or any strict failure under `--strict` |

Always measure all pages before exiting unless an input error prevents measurement.

---

## Hard Constraints

- ESM only, no CJS.
- Node.js >= 22.
- No transpile step.
- Runtime deps only: `parse5`, `css-tree`, `smol-toml`, `chokidar`.
- No heavy CLI framework.
- Native `zlib` only for compression.
- Native HTTP + SSE for dev server.
- Published CLI package must expose the `fin14` binary via `package.json#bin`.
- Published packages must use `files` allowlists so docs, old PRDs, fixtures, and local cache files do not accidentally ship.
- fin14 measures and reports; it never transforms project output.
- `kB` is decimal. `14 kB` means exactly `14,000 bytes`.
- Do not claim real network measurement. Always treat results as deterministic local compressed estimates.

---

## Still Intentionally Flexible

These can be decided during implementation without blocking the architecture:

- exact success output for `fin14 [dir]`
- exact aggregate format for `audit --all`
- visual styling of `report-ui`
- exact wording of non-snapshot diagnostic hints

When deciding these, prefer the PRD examples and keep output stable enough for snapshots.

---

## Implementation Advice For Agents

- Build the smallest vertical slice first: one HTML file, no assets, default CLI command, correct exit code.
- Add one resource type at a time and snapshot behavior as it lands.
- Keep core free of terminal formatting. Core returns data; CLI renders it.
- Keep dev mode last. If the core result contracts are solid, dev mode becomes orchestration instead of invention.
- Treat `npm pack --dry-run` as a release gate, not a last-minute chore.
- Verify `npx fin14` from a packed tarball before considering the package deliverable.
- When the PRD and this file conflict, follow the PRD unless this file is only clarifying an implementation detail the PRD leaves open.
