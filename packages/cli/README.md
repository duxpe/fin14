# fin14

Performance budget linter for static sites. Measures the gzip-compressed page weight of every HTML file produced by your SSG (Hugo, Eleventy, Astro, Jekyll, Next.js) and fails the build when a page exceeds the 14 kB budget. Runs in your terminal and in CI.

## Install

```bash
npm install -D fin14
```

Or run without installing:

```bash
npx fin14 dist/
```

## Why 14 kB

TCP slow-start sends the first 10 network packets before waiting for acknowledgement. On a standard 1500-byte MTU that is roughly 14 kB. A page that fits in the initial congestion window renders without round-trip delay on the first exchange. fin14 measures gzip-compressed weight of everything the browser fetches for the initial page load and fails if any page exceeds the budget.

## Commands

```bash
fin14 [dir]                    # measure all pages (default command)
fin14 check [dir]              # alias for the default command
fin14 audit <file.html>        # detailed asset breakdown for a single page
fin14 audit --all [dir]        # detailed breakdown for every page
fin14 dev [dir]                # watch mode with live browser report
```

## Flags

### All commands

| Flag | Description |
|---|---|
| `--config <path>` | Path to `fin14.toml` |
| `--verbose` | Detailed output |
| `-h`, `--help` | Usage |

### Default and audit commands

| Flag | Description |
|---|---|
| `--force` | Exit 0 even when pages exceed budget |
| `--strict` | Fail on external resources, pages above 12.2 kB, or unknown budget |
| `--build` | Run `build_command` from config before measuring |

### Default command only

| Flag | Description |
|---|---|
| `--json` | Print a machine-readable JSON report to stdout (suppresses the human report) |
| `--baseline <path>` | Compare against a previous `--json` report and show per-page size deltas |
| `--github` | Emit GitHub workflow annotations (auto-enabled when `GITHUB_ACTIONS=true`) |

## Auto-detection

When no `fin14.toml` is present and no directory argument is given, fin14 detects the SSG from config files in the working directory:

| SSG | Detected from | Output dir |
|---|---|---|
| Hugo | `hugo.toml`, `hugo.yaml`, `hugo.json` | `public/` |
| Eleventy | `.eleventy.js`, `eleventy.config.*` | `_site/` |
| Astro | `astro.config.*` | `dist/` |
| Jekyll | `_config.yml`, `_config.toml` | `_site/` |
| Next.js | `next.config.*` | `out/` (static export) |

## Configuration

Create `fin14.toml` in your project root. All fields are optional.

```toml
[project]
output_dir    = "dist"
build_command = "npm run build"
include       = []                  # glob allow-list; empty = all HTML
exclude       = ["404.html"]        # globs to skip

[budget]
default                  = "14kb"   # or integer bytes
compression              = "gzip"   # or "brotli"
compression_level        = 6        # 0–11; gzip auto-clamps to 1–9
cut_candidate_min_bytes  = 2800     # minimum bytes to appear in cut hints

[[budget.overrides]]                # per-page budgets; first match wins
path   = "gallery/**/*.html"
budget = "50kb"

[network]
timeout_ms    = 5000
max_redirects = 5

[viewport]
default = "mobile"                  # or "desktop"

[viewport.mobile]
width               = 390
height              = 844
lazy_visible_images = 1

[viewport.desktop]
width               = 1366
height              = 768
lazy_visible_images = 1

[warnings]
exclude = []                        # suppress warning codes, e.g. ["E14"]
```

### Configuration reference

#### `[project]`

| Key | Default | Description |
|---|---|---|
| `output_dir` | auto-detected | Directory containing built HTML files |
| `build_command` | — | Shell command to build the site before measuring (used with `--build`) |
| `include` | `[]` | Glob allow-list of pages to measure. Empty means all HTML. |
| `exclude` | `[]` | Globs to skip (e.g. `["404.html", "tags/**"]`). `exclude` wins over `include`. |

Globs support `*` (within a path segment), `**` (across segments), and `?`. Patterns
match the page path relative to the output dir. Filtering applies to whole-site runs
(`fin14 [dir]`, `fin14 audit --all`); an explicitly named single file
(`fin14 audit page.html`) is always measured.

#### `[budget]`

| Key | Default | Description |
|---|---|---|
| `default` | `"14kb"` | Budget per page as a string (`"14kb"`) or integer bytes |
| `compression` | `"gzip"` | Compression algorithm: `"gzip"` or `"brotli"` |
| `compression_level` | `6` | `0–11`. Brotli uses the full range; gzip auto-clamps to `1–9` (`0→1`, `10/11→9`) and prints a one-line notice |
| `cut_candidate_min_bytes` | `2800` | Minimum uncompressed bytes for an asset to appear in cut hints |
| `overrides` | `[]` | Array of `{ path, budget }` per-page budgets. First matching `path` glob wins; non-matching pages use `default`. |

Per-page budgets via repeated `[[budget.overrides]]` tables:

```toml
[[budget.overrides]]
path   = "blog/**/*.html"
budget = "20kb"

[[budget.overrides]]
path   = "gallery/**/*.html"
budget = "50kb"
```

A page covered by an override is exempt from the 12.2 kB IPv6 `--strict` warning — it
has explicitly opted into a larger payload envelope.

#### `[network]`

| Key | Default | Description |
|---|---|---|
| `timeout_ms` | `5000` | Request timeout in milliseconds for external resources |
| `max_redirects` | `5` | Maximum redirects to follow |

#### `[viewport]`

| Key | Default | Description |
|---|---|---|
| `default` | `"mobile"` | Active viewport profile: `"mobile"` or `"desktop"` |

Each viewport profile (`[viewport.mobile]`, `[viewport.desktop]`) accepts:

| Key | Description |
|---|---|
| `width` | Viewport width in pixels |
| `height` | Viewport height in pixels |
| `lazy_visible_images` | Number of lazy images assumed visible at page load |

#### `[warnings]`

| Key | Default | Description |
|---|---|---|
| `exclude` | `[]` | List of warning codes to suppress (e.g. `["E14"]`) |

## What counts toward the budget

fin14 measures everything the browser fetches on the initial page load and compresses it to get the page weight.

**Included:**

- HTML document
- CSS files (including `@import` chains)
- JavaScript files
- Images without `loading="lazy"` (plus the first N lazy images based on the viewport heuristic)
- External resources (CDN fonts, third-party scripts) — fetched and measured locally

**Excluded:**

- `srcset` alternate image sources
- JS module import graphs
- CSS `background-image` references
- Favicons
- Lazy-loaded scripts

## `--strict` mode

`--strict` fails (exit 1) on any of the following:

1. **External resource in budget** — a CDN font, Google Fonts stylesheet, or any cross-origin resource is counted in the page weight. Self-host assets to pass.
2. **Page above 12.2 kB** — exceeds the IPv6 MTU heuristic (10 × (1280 − 40 − 20) bytes), meaning the page will not fit in 10 minimum-MTU packets.
3. **Unknown budget** — an external resource fetch failed, or `build_command` exited with an error leaving stale output.

Warnings suppressed via `warnings.exclude` are not evaluated under `--strict`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All pages pass (or `--force` used) |
| `1` | Budget failure or `--strict` violation (measurement ran) |
| `2` | Config, input, or tool error — bad `fin14.toml`, missing output dir, no HTML files, unknown flag (measurement could not run) |

## JSON output

`fin14 ./dist --json` prints a single JSON document to stdout and suppresses the human
report. Exit codes are unchanged (`0`/`1`/`2`), so it stays CI-friendly. Absolute
filesystem paths are stripped for portability — resources are identified by `displayPath`
(relative to the output dir).

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-05T12:00:00.000Z",
  "outputDir": "dist",
  "pages": 32, "pass": 30, "warn": 1, "fail": 1,
  "totalBytes": 384210,
  "results": [
    {
      "file": "about/index.html",
      "status": "fail",
      "totalBytes": 18432, "limitBytes": 14000,
      "overBudget": true, "unknownBudget": false,
      "warnings": [{ "code": "E14", "message": "...", "strictFailure": true }],
      "resources": [{ "group": "html", "type": "html", "displayPath": "about/index.html", "bytes": 7200, "external": false, "inline": true }],
      "cutCandidates": [{ "group": "images", "type": "image", "displayPath": "hero.jpg", "bytes": 9100 }]
    }
  ],
  "topAssets": [/* heaviest resources site-wide */],
  "siteWarnings": []
}
```

## Baseline / regression

Save a report, then compare a later run against it to see what grew or shrank:

```bash
fin14 ./dist --json > budget-baseline.json   # commit or upload as an artifact
fin14 ./dist --baseline budget-baseline.json # later run: prints per-page deltas
```

The comparison is **informational** — it prints `+`/`-` deltas (and added/removed pages)
but does not change the exit code. A missing baseline file is non-fatal (warning, skipped),
so the first run before a baseline exists still works.

## GitHub Action

```yaml
- uses: duxpe/fin14@v1
  with:
    path: dist        # output dir (default: dist)
    strict: 'true'    # optional
    config: fin14.toml # optional
```

The Action runs `fin14` and **annotates** offending files inline on the PR via
`::error file=…` / `::warning file=…` workflow commands (auto-enabled because
`GITHUB_ACTIONS` is set). The step fails on exit `1` (over budget / `--strict`) or `2`
(config/tool error). Outside the Action, pass `--github` to force annotations. Annotations
are suppressed under `--json` (which owns stdout).

## Dev mode

`fin14 dev [dir]` watches the output directory and shows a live report.

- Browser report at `http://localhost:4214` (tries ports 4214–4223 if busy)
- Terminal TUI with a fixed header showing global counters and a scrollable activity zone
- Live browser updates via SSE — no page reload needed
- Adaptive settle delay prevents partial measurements after fast SSG rebuilds

### TUI keys

| Key | Action |
|---|---|
| `R` | Trigger rebuild |
| `Q` | Quit |
| `↑` / `↓` | Navigate pages |
| `Enter` | Show page detail |
| `F` | Toggle warning filters |
| `←` / `→` | Paginate |

## CI/CD

### GitHub Actions

```yaml
name: Budget check

on:
  push:
    branches: [main]
  pull_request:

jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Check page weight
        run: npx fin14 --strict dist/
```

With `--strict`, CI fails when any page (a) counts an external CDN resource toward the budget, (b) exceeds 12.2 kB (the IPv6 MTU heuristic), or (c) has an unknown budget because an external fetch failed. This catches regressions like a Google Fonts `<link>` quietly slipping into a page.

Drop `--strict` to enforce only the 14 kB hard limit.

## Recipes

Per-SSG `package.json` scripts (Astro, Hugo, Eleventy, Jekyll, Next, SvelteKit, Nuxt,
Zola, MkDocs, Docusaurus) are collected in [docs/recipes.md](../../docs/recipes.md).

## License

MIT
