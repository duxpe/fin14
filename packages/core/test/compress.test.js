import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { compress, gzipLevelClampNotice } from '../src/compress.js'

describe('compress', () => {
  it('gzip level 6 compresses repetitive string', () => {
    const input = 'hello world '.repeat(100)
    const result = compress(input, { compression: 'gzip', compression_level: 6 })
    assert.ok(result < input.length, `compressed (${result}) should be smaller than input (${input.length})`)
  })

  it('brotli compresses repetitive string', () => {
    const input = 'hello world '.repeat(100)
    const result = compress(input, { compression: 'brotli', compression_level: 6 })
    assert.ok(result < input.length, `brotli (${result}) should be smaller than input (${input.length})`)
  })

  it('compression_level affects size', () => {
    const input = 'data '.repeat(200)
    const level1 = compress(input, { compression: 'gzip', compression_level: 1 })
    const level9 = compress(input, { compression: 'gzip', compression_level: 9 })
    assert.ok(level1 >= level9, `level 1 (${level1}) should be >= level 9 (${level9})`)
  })

  it('Buffer input works same as string input', () => {
    const input = 'test content '.repeat(50)
    const stringResult = compress(input, { compression: 'gzip', compression_level: 6 })
    const bufferResult = compress(Buffer.from(input), { compression: 'gzip', compression_level: 6 })
    assert.equal(stringResult, bufferResult)
  })

  it('brotli compression_level affects size', () => {
    const input = 'data '.repeat(200)
    const q1 = compress(input, { compression: 'brotli', compression_level: 1 })
    const q11 = compress(input, { compression: 'brotli', compression_level: 11 })
    assert.ok(q1 >= q11, `brotli q1 (${q1}) should be >= q11 (${q11})`)
  })

  it('brotli compression_level 0 does not throw and compresses', () => {
    const input = 'hello world '.repeat(100)
    const result = compress(input, { compression: 'brotli', compression_level: 0 })
    assert.ok(result < input.length, `brotli q0 (${result}) should be smaller than input (${input.length})`)
  })

  it('gzip clamps level above 9 to 9', () => {
    const input = 'data '.repeat(200)
    const level11 = compress(input, { compression: 'gzip', compression_level: 11 })
    const level9 = compress(input, { compression: 'gzip', compression_level: 9 })
    assert.equal(level11, level9)
  })

  it('gzip clamps level 0 to 1', () => {
    const input = 'data '.repeat(200)
    const level0 = compress(input, { compression: 'gzip', compression_level: 0 })
    const level1 = compress(input, { compression: 'gzip', compression_level: 1 })
    assert.equal(level0, level1)
  })
})

describe('gzipLevelClampNotice', () => {
  it('returns a notice for gzip below the valid range', () => {
    const notice = gzipLevelClampNotice({ compression: 'gzip', compression_level: 0 })
    assert.match(notice, /clamped to 1/)
  })

  it('returns a notice for gzip above the valid range', () => {
    const notice = gzipLevelClampNotice({ compression: 'gzip', compression_level: 11 })
    assert.match(notice, /clamped to 9/)
  })

  it('returns null for gzip within the valid range', () => {
    assert.equal(gzipLevelClampNotice({ compression: 'gzip', compression_level: 6 }), null)
  })

  it('returns null for brotli at any level', () => {
    assert.equal(gzipLevelClampNotice({ compression: 'brotli', compression_level: 0 }), null)
    assert.equal(gzipLevelClampNotice({ compression: 'brotli', compression_level: 11 }), null)
  })
})
