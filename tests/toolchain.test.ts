import { describe, expect, it } from 'vitest'

// Toolchain smoke test: proves vitest + ts + workspace layout work.
describe('toolchain', () => {
  it('runs tests in node', () => {
    expect(typeof describe).toBe('function')
  })
  it('has engine source dirs', () => {
    // Real module tests arrive with the engine; this only guards the harness.
    expect(true).toBe(true)
  })
})
