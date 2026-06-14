# @fin14/core

Measurement engine for the [fin14](https://www.npmjs.com/package/@fin14/cli) performance budget CLI. Loads config, measures gzip-compressed page weight against the 14 kB limit, and summarizes results across a static site.

Use this package to integrate fin14 measurement into your own build scripts, CI pipelines, or framework tooling. If you just want a CLI, install `fin14` directly.

## Install

```
npm install @fin14/core
```

Requires Node.js >= 22. ESM only.

## Usage

### Measure a single page

```js
import { loadConfig, measurePage } from '@fin14/core';
import path from 'node:path';

const config = await loadConfig({ outputDir: './dist' });
const result = await measurePage(path.resolve('./dist/index.html'), config);

console.log(result.status);      // 'pass' | 'warn' | 'fail'
console.log(result.totalBytes);  // compressed bytes
console.log(result.overBudget);  // boolean
```

### Measure a whole site with progress callback

```js
import { loadConfig, measureSite } from '@fin14/core';

const config = await loadConfig();

const summary = await measureSite('./dist', config, {
  onStart({ total, files }) {
    console.log(`Measuring ${total} pages...`);
  },
  onPageResult(page, { done, total }) {
    console.log(`[${done}/${total}] ${page.file} — ${page.status}`);
  },
});

console.log(`${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
```

## API

### `loadConfig(options?)`

```js
async function loadConfig(options = {})
```

Loads and merges configuration from `fin14.toml`, applying all defaults. If no config file is found, defaults are used — `fin14.toml` is optional.

| Option | Type | Description |
|---|---|---|
| `config` | `string` | Path to `fin14.toml`. Auto-searches current directory if omitted. |
| `outputDir` | `string` | Overrides `project.output_dir` from the config file. |

Returns the full merged config object. Throws on parse errors or unknown fields in `fin14.toml`.

---

### `measurePage(file, config)`

```js
async function measurePage(file, config)
```

Measures a single HTML page and all its linked resources.

| Param | Type | Description |
|---|---|---|
| `file` | `string` | Absolute path to the `.html` file. |
| `config` | `object` | Result of `loadConfig()`. |

Returns a `PageResult`:

```js
{
  file: string,                  // relative path from outputDir
  status: 'pass' | 'warn' | 'fail',
  totalBytes: number,            // compressed bytes
  limitBytes: number,            // budget limit in bytes
  overBudget: boolean,
  unknownBudget: boolean,
  resources: ResourceResult[],
  cutCandidates: ResourceResult[],
  warnings: Warning[],
  skippedResources: SkippedResource[]
}
```

---

### `measureSite(outputDir, config, options?)`

```js
async function measureSite(outputDir, config, options = {})
```

Discovers and measures all HTML pages under `outputDir`, after applying
`project.include` / `project.exclude` glob filters from the config. Each page is
validated against its resolved budget (`budget.overrides` first-match, else
`budget.default`).

| Param | Type | Description |
|---|---|---|
| `outputDir` | `string` | Path to the SSG output folder. |
| `config` | `object` | Result of `loadConfig()`. |
| `options.onStart` | `function` | Called once before measurement starts. Receives `{ total: number, files: string[] }`. |
| `options.onPageResult` | `function` | Called after each page. Receives `(PageResult, { done: number, total: number })`. |

Returns a `SiteSummary`.

---

### `summarize(results, outputDir, siteWarnings?)`

```js
function summarize(results, outputDir, siteWarnings = [])
```

Aggregates an array of `PageResult` objects into a `SiteSummary`. Useful when you run `measurePage` yourself and want to produce a summary.

| Param | Type | Description |
|---|---|---|
| `results` | `PageResult[]` | Results from `measurePage`. |
| `outputDir` | `string` | Path to the output directory. |
| `siteWarnings` | `Warning[]` | Site-level warnings (e.g. EMFILE retry). |

Returns a `SiteSummary`:

```js
{
  outputDir: string,
  generatedAt: string,           // ISO timestamp
  pages: number,
  pass: number,
  warn: number,
  fail: number,
  totalBytes: number,
  topAssets: ResourceResult[],
  siteWarnings: Warning[],
  results: PageResult[]
}
```

### Glob helpers

```js
import { matchGlob, filterPages, resolveBudget } from '@fin14/core';
```

| Function | Description |
|---|---|
| `matchGlob(path, pattern)` | Anchored glob match (`*`, `**`, `?`) against a posix path. |
| `filterPages(relPaths, config)` | Applies `project.include` / `project.exclude` to a list of relative page paths. |
| `resolveBudget(relFile, config)` | Returns the budget in bytes for a page — first matching `budget.overrides[].path`, else `budget.default`. |

## Types

### `ResourceResult`

```js
{
  key: string,           // dedup key (absolute path or URL)
  type: 'html' | 'css' | 'js' | 'image' | 'font',
  group: 'html' | 'css' | 'js' | 'images' | 'external',
  path: string,          // absolute path or URL
  displayPath: string,   // path shown in output (relative to outputDir)
  external: boolean,
  inline: boolean,
  bytes: number          // compressed bytes
}
```

### `Warning`

```js
{
  code: string,          // e.g. 'E14'
  message: string,
  strictFailure: boolean
}
```

---

For the CLI, see [fin14](https://www.npmjs.com/package/@fin14/cli).

MIT
