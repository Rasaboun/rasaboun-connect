import { parseHumanTime, formatLocal, type Locale } from '../time/parse'

type Props = {
  output: string
  running: boolean
  step: number
  encMs: number | null
  decMs: number | null
  totalMs: number | null
  backend: 'webgpu' | 'wasm' | null
  encTokens: number | null
  locale: Locale
}

function stripToolCall(text: string): string {
  return text.startsWith('<tool_call>') ? text.slice('<tool_call>'.length) : text
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; err: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, err: String(e) }
  }
}

type Call = { name?: string; arguments?: Record<string, unknown> }

function timeRows(calls: unknown[], locale: Locale) {
  const rows: { idx: number; human: string; mode: string | null; iso: string | null; localStr: string | null; certain: boolean }[] = []
  calls.forEach((raw, idx) => {
    const call = raw as Call
    const args = call.arguments ?? {}
    const human = typeof args.time_human === 'string' ? args.time_human : null
    if (!human) return
    const mode = typeof args.time_mode === 'string' ? args.time_mode : null
    const t = parseHumanTime(human, locale)
    rows.push({
      idx,
      human,
      mode,
      iso: t?.iso ?? null,
      localStr: t ? formatLocal(t.date) : null,
      certain: t?.certain ?? false,
    })
  })
  return rows
}

export function Output({
  output,
  running,
  step,
  encMs,
  decMs,
  totalMs,
  backend,
  encTokens,
  locale,
}: Props) {
  if (!output && !running) return null
  const clean = stripToolCall(output).trim()
  const parsed = !running && clean ? parseJson(clean) : null
  const msPerTok = decMs && step > 0 ? decMs / step : null
  const rows =
    parsed?.ok && Array.isArray(parsed.value) ? timeRows(parsed.value, locale) : []

  return (
    <div className="output">
      <div className="output-head">
        <h3>Output {running && <span className="dot">●</span>}</h3>
        <div className="metrics">
          {backend && <span>EP: <b>{backend}</b></span>}
          {encTokens != null && <span>enc in: {encTokens} tok</span>}
          {encMs != null && <span>enc: {encMs.toFixed(0)} ms</span>}
          {msPerTok != null && <span>dec: {msPerTok.toFixed(1)} ms/tok</span>}
          {totalMs != null && <span>total: {totalMs.toFixed(0)} ms</span>}
          {step > 0 && <span>{step} tok</span>}
        </div>
      </div>

      <pre className="text">{clean || ' '}</pre>

      {parsed && (
        <div className={`badge ${parsed.ok ? 'ok' : 'err'}`}>
          {parsed.ok ? '✓ valid JSON' : `✗ ${parsed.err}`}
        </div>
      )}
      {parsed?.ok && Array.isArray(parsed.value) && parsed.value.length === 0 && (
        <div className="muted">empty list: model refused (off-topic / unknown intent)</div>
      )}
      {parsed?.ok && Array.isArray(parsed.value) && parsed.value.length > 0 && (
        <pre className="parsed">{JSON.stringify(parsed.value, null, 2)}</pre>
      )}

      {rows.length > 0 && (
        <div className="time-block">
          <div className="time-label">chrono ({locale})</div>
          {rows.map((r) => (
            <div key={r.idx} className="time-row">
              <code>{r.human}</code>
              <span className="arrow"> → </span>
              {r.iso ? (
                <>
                  <b title={r.iso}>{r.localStr}</b>
                  {!r.certain && <span className="muted"> (partial)</span>}
                  {r.mode && <span className="time-mode"> [{r.mode}]</span>}
                </>
              ) : (
                <span className="muted">could not parse with locale={locale}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
