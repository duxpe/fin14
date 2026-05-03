import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { validate } from '../src/budget/validator.js'
import { DEFAULT_CONFIG, STRICT_IPV6_LIMIT_BYTES } from '../src/constants.js'

const VALIDATOR_CONFIG = {
  budget: { default: DEFAULT_CONFIG.budget.default },
}

function mockResource(key, bytes, external = false) {
  return {
    key,
    type: 'js',
    group: 'js',
    path: `app-${key}.js`,
    displayPath: `app-${key}.js`,
    bytes,
    external,
    inline: false,
  }
}

function mockSkipped(key, reason = 'duplicate') {
  return {
    key,
    type: 'js',
    displayPath: `app-${key}.js`,
    reason,
  }
}

describe('validate', () => {
  it('1: all-pass (small resources, no externals)', () => {
    const results = [
      mockResource('a', 3000),
      mockResource('b', 2000),
      mockResource('c', 1000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.status, 'pass')
    assert.equal(result.overBudget, false)
    assert.equal(result.unknownBudget, false)
    assert.equal(result.totalBytes, 6000)
    assert.equal(result.limitBytes, DEFAULT_CONFIG.budget.default)
    assert.equal(result.warnings.length, 0)
  })

  it('2: over budget (totalBytes > configured default)', () => {
    const results = [
      mockResource('a', 8000),
      mockResource('b', 7000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.status, 'fail')
    assert.equal(result.overBudget, true)
    assert.equal(result.totalBytes, 15000)
  })

  it('3: E13 warning above strict IPv6 threshold, not overBudget', () => {
    const results = [
      mockResource('a', STRICT_IPV6_LIMIT_BYTES - 5000 + 1),
      mockResource('b', 5000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.status, 'warn')
    assert.equal(result.overBudget, false)
    assert.equal(result.totalBytes, STRICT_IPV6_LIMIT_BYTES + 1)
    const e13 = result.warnings.find(w => w.code === 'E13')
    assert.ok(e13)
    assert.equal(e13.strictFailure, true)
    assert.match(e13.message, /12\.2kB/)
    assert.match(e13.message, /IPv6/)
  })

  it('does not emit E13 at the strict IPv6 threshold', () => {
    const results = [mockResource('a', STRICT_IPV6_LIMIT_BYTES)]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.status, 'pass')
    assert.equal(result.warnings.some(w => w.code === 'E13'), false)
  })

  it('4: E14 warning (external resource)', () => {
    const results = [
      mockResource('a', 5000),
      mockResource('b', 8000, true),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.status, 'warn')
    const e14 = result.warnings.find(w => w.code === 'E14')
    assert.ok(e14)
    assert.equal(e14.strictFailure, true)
    assert.match(e14.message, /external resource/)
  })

  it('5: E19 in input warnings sets unknownBudget=true', () => {
    const results = [mockResource('a', 5000)]
    const skipped = []
    const warnings = [
      { code: 'E19', message: 'unknown error', strictFailure: false },
    ]

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.unknownBudget, true)
    assert.ok(result.warnings.some(w => w.code === 'E19'))
  })

  it('6: cutCandidates when overBudget covers the overage', () => {
    const results = [
      mockResource('a', 6000),
      mockResource('b', 5000),
      mockResource('c', 4000),
      mockResource('d', 3000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.overBudget, true)
    const overage = 18000 - DEFAULT_CONFIG.budget.default
    const cutBytes = result.cutCandidates.reduce((s, r) => s + r.bytes, 0)
    assert.ok(cutBytes >= overage)
    assert.ok(result.cutCandidates.length >= 1)
    assert.equal(result.cutCandidates[0].bytes, 6000)
  })

  it('7: cutCandidates when not overBudget returns top 3 largest', () => {
    const results = [
      mockResource('a', 4000),
      mockResource('b', 3000),
      mockResource('c', 2000),
      mockResource('d', 1000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.overBudget, false)
    assert.equal(result.cutCandidates.length, 3)
    assert.equal(result.cutCandidates[0].bytes, 4000)
    assert.equal(result.cutCandidates[1].bytes, 3000)
    assert.equal(result.cutCandidates[2].bytes, 2000)
  })

  it('8: skipped resources passed through to output', () => {
    const results = [mockResource('a', 5000)]
    const skipped = [
      mockSkipped('dup1', 'duplicate'),
      mockSkipped('dup2', 'duplicate'),
    ]
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.skippedResources.length, 2)
    assert.equal(result.skippedResources[0].reason, 'duplicate')
  })

  it('does not mutate input warnings array', () => {
    const results = [mockResource('a', 5000)]
    const skipped = []
    const warnings = []
    const originalLength = warnings.length

    validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(warnings.length, originalLength)
  })

  it('cutCandidates minimum 1 when overBudget even with small overage', () => {
    const results = [mockResource('a', DEFAULT_CONFIG.budget.default + 1)]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.overBudget, true)
    assert.equal(result.cutCandidates.length, 1)
    assert.equal(result.cutCandidates[0].bytes, DEFAULT_CONFIG.budget.default + 1)
  })

  it('cutCandidates returns fewer than 3 if fewer resources exist', () => {
    const results = [
      mockResource('a', 3000),
      mockResource('b', 2000),
    ]
    const skipped = []
    const warnings = []

    const result = validate(results, skipped, warnings, VALIDATOR_CONFIG, 'index.html')

    assert.equal(result.overBudget, false)
    assert.equal(result.cutCandidates.length, 2)
  })
})
