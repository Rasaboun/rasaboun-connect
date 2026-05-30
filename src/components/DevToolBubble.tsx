import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import type { MetricState } from './types'

// Floating dev overlay (bottom-right): surfaces the raw model tool-call output,
// token/latency metrics, and any error. Hidden until there's something to show.
export function DevToolBubble({ output, metrics, error }: { output: string; metrics: MetricState | null; error: string | null }) {
  const [open, setOpen] = useState(false)
  if (!output && !error) return null
  return (
    <>
      <button
        aria-label="Ouvrir les outils de développement"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0C131F] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed bottom-20 right-6 z-50 w-[28rem] max-w-[calc(100vw-3rem)]"
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
          >
            <div className="rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#127996]">Needle</p>
                  <h2 className="mt-1 text-2xl font-black text-[#0C131F]">Traduction en tool call</h2>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              {metrics ? (
                <p className="mt-3 inline-block rounded-full bg-[#F1F4F8] px-3 py-2 text-xs font-black text-slate-600">
                  {metrics.inputTokens} in · {metrics.outputTokens} out · {Math.round(metrics.latencyMs)} ms
                </p>
              ) : null}
              {error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
              {output ? (
                <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-[#0C131F] p-4 text-xs leading-6 text-[#8DE8FE]">
                  {output}
                </pre>
              ) : null}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
