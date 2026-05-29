import { describe, expect, it } from 'vitest'
import { aggregateProgress } from './progress'
import type { Progress } from './cache'

const p = (name: string, loaded: number, total: number): Progress => ({ name, loaded, total })

describe('aggregateProgress', () => {
  it('is indeterminate with no progress yet', () => {
    const r = aggregateProgress({}, 5)
    expect(r.indeterminate).toBe(true)
    expect(r.loaded).toBe(0)
    expect(r.total).toBe(0)
    expect(r.pct).toBe(0)
  })

  it('stays indeterminate until every expected file reports a nonzero total', () => {
    const progress = {
      a: p('a', 50, 100),
      b: p('b', 10, 0), // started streaming, no content-length header yet
    }
    expect(aggregateProgress(progress, 5).indeterminate).toBe(true)
  })

  it('becomes determinate once all expected files report a nonzero total', () => {
    const progress = {
      a: p('a', 50, 100),
      b: p('b', 0, 100),
    }
    const r = aggregateProgress(progress, 2)
    expect(r.indeterminate).toBe(false)
    expect(r.loaded).toBe(50)
    expect(r.total).toBe(200)
    expect(r.pct).toBe(25)
  })

  it('reports 100% when every file is fully loaded', () => {
    const progress = {
      a: p('a', 100, 100),
      b: p('b', 40, 40),
    }
    const r = aggregateProgress(progress, 2)
    expect(r.indeterminate).toBe(false)
    expect(r.pct).toBe(100)
  })

  it('clamps pct to 100 if a stream slightly overruns its content-length', () => {
    const r = aggregateProgress({ a: p('a', 105, 100) }, 1)
    expect(r.pct).toBe(100)
  })
})
