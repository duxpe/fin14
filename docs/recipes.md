# fin14 recipes

fin14 measures already-generated output. The pattern is always the same: build the
site, then point fin14 at the output directory. Add a `budget` script and a `ci`
script that chains build + budget.

fin14 auto-detects the output directory for Hugo, Eleventy, Astro, Jekyll, and Next.js
(static export). For other generators, pass the directory explicitly or set
`project.output_dir` in `fin14.toml`.

```bash
npm install -D fin14
```

## Astro

```json
{
  "scripts": {
    "build": "astro build",
    "budget": "fin14 ./dist",
    "ci": "npm run build && npm run budget"
  }
}
```

## Hugo

```json
{
  "scripts": {
    "build": "hugo --minify",
    "budget": "fin14 ./public",
    "ci": "npm run build && npm run budget"
  }
}
```

## Eleventy

```json
{
  "scripts": {
    "build": "eleventy",
    "budget": "fin14 ./_site",
    "ci": "npm run build && npm run budget"
  }
}
```

## Jekyll

```json
{
  "scripts": {
    "build": "bundle exec jekyll build",
    "budget": "fin14 ./_site",
    "ci": "npm run build && npm run budget"
  }
}
```

## Next.js (static export)

```json
{
  "scripts": {
    "build": "next build",
    "budget": "fin14 ./out",
    "ci": "npm run build && npm run budget"
  }
}
```

## SvelteKit (`adapter-static`)

```json
{
  "scripts": {
    "build": "vite build",
    "budget": "fin14 ./build",
    "ci": "npm run build && npm run budget"
  }
}
```

## Nuxt (`nuxt generate`)

```json
{
  "scripts": {
    "build": "nuxt generate",
    "budget": "fin14 ./.output/public",
    "ci": "npm run build && npm run budget"
  }
}
```

## Zola

```json
{
  "scripts": {
    "build": "zola build",
    "budget": "fin14 ./public",
    "ci": "npm run build && npm run budget"
  }
}
```

## MkDocs

```json
{
  "scripts": {
    "build": "mkdocs build",
    "budget": "fin14 ./site",
    "ci": "npm run build && npm run budget"
  }
}
```

## Docusaurus

```json
{
  "scripts": {
    "build": "docusaurus build",
    "budget": "fin14 ./build",
    "ci": "npm run build && npm run budget"
  }
}
```

## Excluding generated junk

Static generators emit pages that should not be linted (error pages, tag indexes,
search shells, print views). Exclude them so they do not produce false failures:

```toml
[project]
exclude = ["404.html", "tags/**", "search/**", "print/**"]
```

## Per-page budgets

Image-heavy or long-form pages can carry a larger budget than the default 14 kB. The
first matching override wins; everything else uses `budget.default`:

```toml
[budget]
default = "14kb"

[[budget.overrides]]
path = "gallery/**/*.html"
budget = "50kb"

[[budget.overrides]]
path = "blog/**/*.html"
budget = "20kb"
```

A page with an override opts out of the conservative 12.2 kB IPv6 strict warning, since
it has explicitly accepted a larger payload envelope.

## CI exit codes

| Code | Meaning |
|---|---|
| `0` | All measured pages pass (or `--force`) |
| `1` | A page exceeded its budget, or a `--strict` violation |
| `2` | Configuration, input, or tool error (bad `fin14.toml`, missing output dir, no HTML files) |

`2` lets CI distinguish "the site is over budget" from "fin14 could not run" — for
example, fail the pipeline on `1` but treat `2` as a setup error to investigate.

## GitHub Action

```yaml
name: Budget check
on: [push, pull_request]

jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
      - uses: duxpe/fin14@v1
        with:
          path: dist
          strict: 'true'
```

The Action annotates offending files inline on the PR (`::error file=…`) and fails the
job on exit `1`/`2`. To run fin14 directly instead of the Action, `npx fin14 ./dist`
emits the same annotations automatically inside GitHub Actions.

## Baseline / regression in CI

Compare each run against a stored report to catch size creep before it crosses the limit:

```yaml
      - run: npm ci && npm run build
      # produce the current report
      - run: npx fin14 ./dist --json > budget.json
      # compare against the committed baseline (informational)
      - run: npx fin14 ./dist --baseline budget-baseline.json
```

Generate the baseline once with `fin14 ./dist --json > budget-baseline.json` and commit
it (or restore it from a cache/artifact). The `--baseline` comparison prints `+`/`-`
deltas without failing the build; the hard 14 kB limit still fails via the normal run.
