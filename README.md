<p align="center">
  <img src=".github/assets/logo.svg" alt="fin14" width="164" />
</p>

<p align="center">14 kB budget linter for static sites</p>

fin14 is a page weight linter for static sites. Run `fin14 dev` and get a live budget dashboard that updates as your SSG rebuilds — gzip-compressed size for every page, in real time, with resources breakdow. When you push, `fin14` can enforce the same 14 kB limit in CI. A page under 14 kB fits in a single TCP round-trip; fin14 keeps it there.

[![npm version](https://img.shields.io/npm/v/fin14.svg)](https://www.npmjs.com/package/fin14)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Install fin14

```bash
npm install -D fin14
```

Or try it immediately — fin14 auto-detects your SSG output dir:

```bash
npx fin14
```

## Usage

```bash
fin14 dev          # live budget dashboard at localhost:4214 (auto-detects output dir)
fin14              # validate all pages — use in CI
fin14 audit public/index.html   # detailed breakdown for a single page
```

If auto-detection doesn't match your setup, pass the output dir explicitly: `fin14 dev public/`.

## Works with any SSG

fin14 auto-detects your generator and output directory:

| SSG | Detected from | Output dir |
|---|---|---|
| Hugo | `hugo.toml` / `hugo.yaml` / `hugo.json` | `public/` |
| Eleventy | `.eleventy.js` / `eleventy.config.*` | `_site/` |
| Astro | `astro.config.*` | `dist/` |
| Jekyll | `_config.yml` / `_config.toml` | `_site/` |
| Next.js | `next.config.*` | `out/` |

Pass an explicit path to override detection.

## Use on your CI/CD pipeline

```yaml
- name: Build
  run: npm run build
- name: Check page budget
  run: npx fin14 --strict
```

`--strict` also fails on external CDN resources counted in the budget and pages above 12.2 kB (the IPv6 MTU heuristic: 10 × (1280 − 40 − 20) bytes).

## Works with any Budget (not only 14kB) 

Drop a `fin14.toml` at the project root for a more flexible and customized experience:

```toml
[project]
output_dir    = "dist"          # set explicitly if auto-detection doesn't match
build_command = "npm run build" # optional: R key in dev mode triggers this

[budget]
default     = "14kb"            # 14,000 bytes; accepts integer bytes too
compression = "gzip"            # or "brotli"

[warnings]
exclude = []                    # suppress specific warning codes, e.g. ["E14"]
```

Without a config file, fin14 applies all defaults and auto-detects the output dir. The full config reference (viewport, network, per-field defaults) is in the [CLI readme](./packages/cli/README.md).

## License

MIT
