import * as ort from 'onnxruntime-web'

export type Backend = 'webgpu' | 'wasm'

export type NeedleConfig = {
  vocab_size: number
  d_model: number
  num_heads: number
  num_kv_heads: number
  num_encoder_layers: number
  num_decoder_layers: number
  max_seq_len: number
  pad_token_id: number
}

export type NeedleSessions = {
  enc: ort.InferenceSession
  dec: ort.InferenceSession
  cfg: NeedleConfig
  backend: Backend
}

let _envConfigured = false
function configureEnv() {
  if (_envConfigured) return
  // Pull ORT WASM artifacts from jsDelivr (matches the installed version).
  // Avoids needing a Vite plugin to copy .wasm files into the dev server.
  const v = ort.env.versions?.common ?? '1.26.0'
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${v}/dist/`
  ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 4, 4)
  ort.env.wasm.simd = true
  _envConfigured = true
}

async function tryCreate(
  bytes: ArrayBuffer,
  eps: Backend[],
): Promise<{ session: ort.InferenceSession; backend: Backend }> {
  for (const ep of eps) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      })
      return { session, backend: ep }
    } catch (err) {
      console.warn(`[needle] EP ${ep} failed:`, err)
    }
  }
  throw new Error(`all execution providers failed: ${eps.join(', ')}`)
}

export async function createSessions(
  encoderBytes: ArrayBuffer,
  decoderBytes: ArrayBuffer,
  cfg: NeedleConfig,
  preferred: Backend[] = ['wasm'],
): Promise<NeedleSessions> {
  configureEnv()
  const e = await tryCreate(encoderBytes, preferred)
  // Force decoder to same backend as encoder so tensors don't have to cross EPs.
  const d = await tryCreate(decoderBytes, [e.backend])
  return { enc: e.session, dec: d.session, cfg, backend: e.backend }
}
