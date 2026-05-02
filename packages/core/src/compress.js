import { gzipSync, brotliCompressSync } from 'node:zlib'

export function compress(content, config) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
  if (config.compression === 'brotli') {
    return brotliCompressSync(buf).length
  }
  return gzipSync(buf, { level: config.compression_level }).length
}
