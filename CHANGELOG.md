# Changelog

All notable changes to fin14 and @fin14/core are documented here.

## [Unreleased]

### Added

- Page filtering: `project.include` / `project.exclude` glob lists in `fin14.toml` to skip generated junk (404 pages, tag indexes, search shells). Globs support `*`, `**`, `?`. Explicitly named single-file audits are never filtered.
- Per-page budgets: `[[budget.overrides]]` (`{ path, budget }`) with first-match-wins resolution; non-matching pages use `budget.default`.
- Exit code `2` for config / input / tool errors (bad `fin14.toml`, missing output dir, no HTML files, unknown flag), distinct from `1` (budget / `--strict` failure). `0` unchanged.
- `@fin14/core` exports `matchGlob`, `filterPages`, `resolveBudget`.
- `docs/recipes.md` — per-SSG build + budget script recipes.

### Changed

- Pages with a `budget.overrides` match are exempt from the 12.2 kB IPv6 `--strict` warning (they opted into a larger envelope).
- Config / input / tool errors now exit `2` instead of `1`.

## [0.1.0] - 2026-05-03

### Added

- `fin14 [dir]` — measure and validate all pages against the 14 kB budget
- `fin14 audit <file.html>` — detailed per-resource breakdown for a single page
- `fin14 audit --all [dir]` — audit all pages in the output dir
- `fin14 dev [dir]` — watch mode with live budget report at localhost:4214 and terminal TUI
- Automatic output dir detection for Hugo, Eleventy, Astro, Jekyll, and Next.js
- gzip (default, level 6) and brotli compression measurement — both honor `compression_level` (0–11); gzip auto-clamps to its valid 1–9 range with a notice
- External resource fetch with 1-hour cache (`.fin14/cache/`)
- `--strict` mode: fails on external resources, pages above 12.2 kB (IPv6 heuristic), and unknown budget
- `--force` mode: exit 0 even on budget failures
- Warning exclusion via `warnings.exclude` in `fin14.toml`
- Session-only warning toggles in TUI (`F` key) and web report
- `@fin14/core` programmatic API: `loadConfig`, `measurePage`, `measureSite`, `summarize`
