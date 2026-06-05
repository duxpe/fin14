import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import { GZIP_MIN_LEVEL, GZIP_MAX_LEVEL } from './constants.js'

export function compress(content, config) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
  if (config.compression === 'brotli') {
    return brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: config.compression_level },
    }).length
  }
  const level = Math.min(Math.max(config.compression_level, GZIP_MIN_LEVEL), GZIP_MAX_LEVEL)
  return gzipSync(buf, { level }).length
}

export function gzipLevelClampNotice(budget) {
  if (budget.compression !== 'gzip') return null
  const level = budget.compression_level
  if (level < GZIP_MIN_LEVEL || level > GZIP_MAX_LEVEL) {
    const effective = Math.min(Math.max(level, GZIP_MIN_LEVEL), GZIP_MAX_LEVEL)
    return `compression_level ${level} clamped to ${effective} (gzip range ${GZIP_MIN_LEVEL}–${GZIP_MAX_LEVEL}); use brotli for level 0 or 10–11`
  }
  return null
}
