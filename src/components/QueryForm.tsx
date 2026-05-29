import { useState } from 'react'
import { EXAMPLE_QUERIES } from '../constants'
import type { Locale } from '../time/parse'

type Props = {
  query: string
  setQuery: (q: string) => void
  tools: string
  setTools: (t: string) => void
  locale: Locale
  setLocale: (l: Locale) => void
  onRun: () => void
  running: boolean
}

export function QueryForm({
  query,
  setQuery,
  tools,
  setTools,
  locale,
  setLocale,
  onRun,
  running,
}: Props) {
  const [showTools, setShowTools] = useState(false)
  return (
    <div className="form">
      <label className="field">
        <span>Query</span>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          aria-label="Query"
          placeholder="Ask in French or English…"
        />
      </label>

      <div className="examples">
        <span className="muted">Examples:</span>
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            className="chip"
            onClick={() => setQuery(q)}
            disabled={running}
            type="button"
          >
            {q}
          </button>
        ))}
      </div>

      <label className="locale-pick">
        <span>Time locale (chrono)</span>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          disabled={running}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>

      <details open={showTools} onToggle={(e) => setShowTools(e.currentTarget.open)}>
        <summary>Tools JSON (editable)</summary>
        <textarea
          className="tools"
          value={tools}
          onChange={(e) => setTools(e.target.value)}
          rows={12}
          aria-label="Tools JSON"
        />
      </details>

      <button className="run" onClick={onRun} disabled={running || !query.trim()} type="button">
        {running ? 'Generating…' : 'Generate tool call'}
      </button>
    </div>
  )
}
