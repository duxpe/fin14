import { readFile, access } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { BYTES_PER_KB, DEFAULT_CONFIG } from './constants.js'

const SSG_DETECTORS = [
  { files: ['hugo.toml', 'hugo.yaml', 'hugo.json'],                                                dir: 'public' },
  { files: ['.eleventy.js', 'eleventy.config.js', 'eleventy.config.mjs', 'eleventy.config.cjs'],   dir: '_site'  },
  { files: ['astro.config.js', 'astro.config.ts', 'astro.config.mjs', 'astro.config.cjs'],         dir: 'dist'   },
  { files: ['_config.yml', '_config.toml'],                                                         dir: '_site'  },
  { files: ['next.config.js', 'next.config.ts', 'next.config.mjs'],                                dir: 'out'    },
]

async function detectOutputDir(cwd) {
  for (const { files, dir } of SSG_DETECTORS) {
    for (const file of files) {
      try { await access(`${cwd}/${file}`); return dir } catch {}
    }
  }
  return null
}

const KNOWN_KEYS = {
  project:  new Set(['output_dir', 'build_command']),
  budget:   new Set(['default', 'compression', 'compression_level', 'cut_candidate_min_bytes']),
  network:  new Set(['timeout_ms', 'max_redirects']),
  viewport: new Set(['default', 'mobile', 'desktop']),
  warnings: new Set(['exclude']),
}

const VIEWPORT_PRESET_KEYS = new Set(['width', 'height', 'lazy_visible_images'])

function assertType(value, expectedType, fieldPath) {
  if (typeof value !== expectedType) {
    throw new Error(`fin14.toml: ${fieldPath}: expected ${expectedType}, got ${typeof value}`)
  }
}

function assertInteger(value, fieldPath) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`fin14.toml: ${fieldPath}: expected integer, got ${typeof value}`)
  }
}

function parseBudgetDefault(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`fin14.toml: budget.default: expected integer or "NNkb" string, got float`)
    }
    return value
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)kb$/i)
    if (!match) {
      throw new Error(`fin14.toml: budget.default: invalid value "${value}", expected integer or "NNkb" string`)
    }
    return Math.round(parseFloat(match[1]) * BYTES_PER_KB)
  }
  throw new Error(`fin14.toml: budget.default: expected integer or string, got ${typeof value}`)
}

function validateViewportPreset(preset, name, userPreset) {
  for (const key of Object.keys(userPreset)) {
    if (!VIEWPORT_PRESET_KEYS.has(key)) {
      throw new Error(`E04: fin14.toml: unknown field 'viewport.${name}.${key}'`)
    }
  }
  const result = { ...preset }
  if (userPreset.width !== undefined) {
    assertInteger(userPreset.width, `viewport.${name}.width`)
    if (userPreset.width <= 0) throw new Error(`fin14.toml: viewport.${name}.width: must be > 0`)
    result.width = userPreset.width
  }
  if (userPreset.height !== undefined) {
    assertInteger(userPreset.height, `viewport.${name}.height`)
    if (userPreset.height <= 0) throw new Error(`fin14.toml: viewport.${name}.height: must be > 0`)
    result.height = userPreset.height
  }
  if (userPreset.lazy_visible_images !== undefined) {
    assertInteger(userPreset.lazy_visible_images, `viewport.${name}.lazy_visible_images`)
    if (userPreset.lazy_visible_images < 0) throw new Error(`fin14.toml: viewport.${name}.lazy_visible_images: must be >= 0`)
    result.lazy_visible_images = userPreset.lazy_visible_images
  }
  return result
}

function mergeConfig(user) {
  const result = {
    project:  { ...DEFAULT_CONFIG.project },
    budget:   { ...DEFAULT_CONFIG.budget },
    network:  { ...DEFAULT_CONFIG.network },
    viewport: {
      default: DEFAULT_CONFIG.viewport.default,
      mobile:  { ...DEFAULT_CONFIG.viewport.mobile },
      desktop: { ...DEFAULT_CONFIG.viewport.desktop },
    },
    warnings: { exclude: [...DEFAULT_CONFIG.warnings.exclude] },
  }

  for (const key of Object.keys(user)) {
    if (!KNOWN_KEYS[key]) {
      throw new Error(`E04: fin14.toml: unknown field '${key}'`)
    }
  }

  if (user.project) {
    for (const key of Object.keys(user.project)) {
      if (!KNOWN_KEYS.project.has(key)) {
        throw new Error(`E04: fin14.toml: unknown field 'project.${key}'`)
      }
    }
    if (user.project.output_dir !== undefined) {
      assertType(user.project.output_dir, 'string', 'project.output_dir')
      result.project.output_dir = user.project.output_dir
    }
    if (user.project.build_command !== undefined) {
      assertType(user.project.build_command, 'string', 'project.build_command')
      result.project.build_command = user.project.build_command
    }
  }

  if (user.budget) {
    for (const key of Object.keys(user.budget)) {
      if (!KNOWN_KEYS.budget.has(key)) {
        throw new Error(`E04: fin14.toml: unknown field 'budget.${key}'`)
      }
    }
    if (user.budget.default !== undefined) {
      result.budget.default = parseBudgetDefault(user.budget.default)
    }
    if (user.budget.compression !== undefined) {
      assertType(user.budget.compression, 'string', 'budget.compression')
      if (!['gzip', 'brotli'].includes(user.budget.compression)) {
        throw new Error(`fin14.toml: budget.compression: must be "gzip" or "brotli"`)
      }
      result.budget.compression = user.budget.compression
    }
    if (user.budget.compression_level !== undefined) {
      assertInteger(user.budget.compression_level, 'budget.compression_level')
      if (user.budget.compression_level < 1 || user.budget.compression_level > 9) {
        throw new Error(`fin14.toml: budget.compression_level: must be 1–9`)
      }
      result.budget.compression_level = user.budget.compression_level
    }
    if (user.budget.cut_candidate_min_bytes !== undefined) {
      if (!Number.isInteger(user.budget.cut_candidate_min_bytes) || user.budget.cut_candidate_min_bytes < 0) {
        throw new Error(`E04: fin14.toml: budget.cut_candidate_min_bytes must be a non-negative integer`)
      }
      result.budget.cut_candidate_min_bytes = user.budget.cut_candidate_min_bytes
    }
  }

  if (user.network) {
    for (const key of Object.keys(user.network)) {
      if (!KNOWN_KEYS.network.has(key)) {
        throw new Error(`E04: fin14.toml: unknown field 'network.${key}'`)
      }
    }
    if (user.network.timeout_ms !== undefined) {
      assertInteger(user.network.timeout_ms, 'network.timeout_ms')
      if (user.network.timeout_ms <= 0) throw new Error(`fin14.toml: network.timeout_ms: must be > 0`)
      result.network.timeout_ms = user.network.timeout_ms
    }
    if (user.network.max_redirects !== undefined) {
      assertInteger(user.network.max_redirects, 'network.max_redirects')
      if (user.network.max_redirects < 0) throw new Error(`fin14.toml: network.max_redirects: must be >= 0`)
      result.network.max_redirects = user.network.max_redirects
    }
  }

  if (user.viewport) {
    for (const key of Object.keys(user.viewport)) {
      if (!KNOWN_KEYS.viewport.has(key)) {
        throw new Error(`E04: fin14.toml: unknown field 'viewport.${key}'`)
      }
    }
    if (user.viewport.default !== undefined) {
      assertType(user.viewport.default, 'string', 'viewport.default')
      if (!['mobile', 'desktop'].includes(user.viewport.default)) {
        throw new Error(`fin14.toml: viewport.default: must be "mobile" or "desktop"`)
      }
      result.viewport.default = user.viewport.default
    }
    if (user.viewport.mobile !== undefined) {
      if (typeof user.viewport.mobile !== 'object' || Array.isArray(user.viewport.mobile)) {
        throw new Error(`fin14.toml: viewport.mobile: expected object, got ${typeof user.viewport.mobile}`)
      }
      result.viewport.mobile = validateViewportPreset(result.viewport.mobile, 'mobile', user.viewport.mobile)
    }
    if (user.viewport.desktop !== undefined) {
      if (typeof user.viewport.desktop !== 'object' || Array.isArray(user.viewport.desktop)) {
        throw new Error(`fin14.toml: viewport.desktop: expected object, got ${typeof user.viewport.desktop}`)
      }
      result.viewport.desktop = validateViewportPreset(result.viewport.desktop, 'desktop', user.viewport.desktop)
    }
  }

  if (user.warnings) {
    for (const key of Object.keys(user.warnings)) {
      if (!KNOWN_KEYS.warnings.has(key)) {
        throw new Error(`E04: fin14.toml: unknown field 'warnings.${key}'`)
      }
    }
    if (user.warnings.exclude !== undefined) {
      if (!Array.isArray(user.warnings.exclude) || !user.warnings.exclude.every(v => typeof v === 'string')) {
        throw new Error(`E04: fin14.toml: warnings.exclude must be an array of strings`)
      }
      result.warnings.exclude = user.warnings.exclude
    }
  }

  return result
}

export async function loadConfig(options = {}) {
  let raw = null

  if (options.config) {
    let content
    try {
      content = await readFile(options.config, 'utf8')
    } catch (err) {
      throw new Error(`E03: fin14.toml: ${err.message}`)
    }
    try {
      raw = parse(content)
    } catch (err) {
      throw new Error(`E03: fin14.toml: ${err.message}`)
    }
  } else {
    const defaultPath = `${process.cwd()}/fin14.toml`
    try {
      const content = await readFile(defaultPath, 'utf8')
      try {
        raw = parse(content)
      } catch (err) {
        throw new Error(`E03: fin14.toml: ${err.message}`)
      }
    } catch (err) {
      if (err.message.startsWith('E03:')) throw err
    }
  }

  const config = mergeConfig(raw ?? {})

  if (options.outputDir !== undefined) {
    config.project.output_dir = options.outputDir
  }

  if (config.project.output_dir === null) {
    config.project.output_dir = await detectOutputDir(process.cwd())
  }

  return config
}
