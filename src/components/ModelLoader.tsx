import type { Progress } from '../inference/cache'

type Props = {
  progress: Record<string, Progress>
  error: string | null
  backend: 'webgpu' | 'wasm' | null
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ModelLoader({ progress, error, backend }: Props) {
  const items = Object.values(progress)
  return (
    <div className="loader">
      <h2>Loading v29 …</h2>
      <p className="muted">
        First load fetches ~140 MB. Cached in IndexedDB for subsequent visits.
      </p>
      <ul className="files">
        {items.map((p) => {
          const pct = p.total > 0 ? Math.min(100, (p.loaded / p.total) * 100) : 0
          const done = p.loaded === p.total && p.total > 0
          return (
            <li key={p.name}>
              <div className="row">
                <span className="name">{p.name}</span>
                <span className="size">
                  {fmt(p.loaded)}
                  {p.total > 0 ? ` / ${fmt(p.total)}` : ''}
                  {done ? ' ✓' : ''}
                </span>
              </div>
              <div className="bar">
                <div className="fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {backend && <p className="muted">Backend: <b>{backend}</b></p>}
      {error && <pre className="error">{error}</pre>}
    </div>
  )
}
