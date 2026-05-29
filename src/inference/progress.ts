import type { Progress } from './cache'

export type Aggregate = {
  loaded: number
  total: number
  pct: number
  indeterminate: boolean
}

// Roll per-file download progress into one overall figure for the search-bar
// status pill. Stays `indeterminate` until every expected file has reported a
// nonzero content-length total — only then is the denominator fixed and the
// percentage monotonic (loaded only grows), so the bar never jumps backwards.
export function aggregateProgress(
  progress: Record<string, Progress>,
  expectedCount: number,
): Aggregate {
  const items = Object.values(progress)
  const withTotal = items.filter((p) => p.total > 0)
  const loaded = items.reduce((sum, p) => sum + p.loaded, 0)
  const total = withTotal.reduce((sum, p) => sum + p.total, 0)
  const indeterminate = withTotal.length < expectedCount
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
  return { loaded, total, pct, indeterminate }
}
