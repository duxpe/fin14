import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { compress } from '../src/compress.js'

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
})
