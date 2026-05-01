# @fin14/core

Measurement engine for [fin14](https://github.com/duxpe/fin14). Provides config loading, HTML crawling, and budget measurement as a programmatic API.

## Install

```bash
npm install @fin14/core
```

## Usage

```js
import { loadConfig } from '@fin14/core'

const config = await loadConfig({ outputDir: 'dist' })
```

## License

MIT
