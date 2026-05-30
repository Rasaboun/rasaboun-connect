import { useCallback, useEffect, useState } from 'react'
import { MODEL_FILES } from '../constants'
import { fetchCached, type Progress } from '../inference/cache'
import { createSessions, type NeedleSessions } from '../inference/session'
import { NeedleTokenizer, type Specials } from '../inference/tokenizer'

export type NeedleModel = {
  sessions: NeedleSessions
  tokenizer: NeedleTokenizer
}

// Coordinates the on-device model: streams the encoder/decoder/tokenizer/config
// files (with per-file download progress), then builds the tokenizer + ONNX
// sessions. `retry()` bumps a key that re-runs the effect with a fresh cancel
// flag, so retries never run against stale closures.
export function useNeedleModel() {
  const [model, setModel] = useState<NeedleModel | null>(null)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Bumped by retry(); the effect depends on it, so each bump re-runs the
  // download with its own `cancelled` flag (no stale closures across retries).
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        setProgress({})
        const track = (p: Progress) => setProgress((current) => ({ ...current, [p.name]: p }))
        const [encoderBytes, decoderBytes, tokenizerBytes, specialsBytes, configBytes] = await Promise.all([
          fetchCached(MODEL_FILES.encoder.name, MODEL_FILES.encoder.url, track),
          fetchCached(MODEL_FILES.decoder.name, MODEL_FILES.decoder.url, track),
          fetchCached(MODEL_FILES.tokenizer.name, MODEL_FILES.tokenizer.url, track),
          fetchCached(MODEL_FILES.specials.name, MODEL_FILES.specials.url, track),
          fetchCached(MODEL_FILES.config.name, MODEL_FILES.config.url, track),
        ])
        if (cancelled) return

        const config = JSON.parse(new TextDecoder().decode(configBytes)) as NeedleSessions['cfg']
        const specials = JSON.parse(new TextDecoder().decode(specialsBytes)) as Specials
        const tokenizer = new NeedleTokenizer()
        await tokenizer.load(tokenizerBytes, specials)
        const sessions = await createSessions(encoderBytes, decoderBytes, config, ['wasm'])
        if (!cancelled) setModel({ sessions, tokenizer })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load Needle model.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const retry = useCallback(() => setReloadKey((key) => key + 1), [])

  return { model, progress, error, loading, retry }
}
