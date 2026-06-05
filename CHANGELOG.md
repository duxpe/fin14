# Changelog

All notable changes to fin14 and @fin14/core are documented here.

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
