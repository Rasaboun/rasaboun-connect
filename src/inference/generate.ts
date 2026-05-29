import * as ort from 'onnxruntime-web'
import type { NeedleSessions } from './session'
import type { NeedleTokenizer } from './tokenizer'

export type GenStep = {
  step: number
  tokenId: number
  newText: string
  fullText: string
  fullIds: number[]
}

function argmax(arr: Float32Array): number {
  let best = 0
  let bestV = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > bestV) {
      bestV = arr[i]
      best = i
    }
  }
  return best
}

export async function encode(
  sessions: NeedleSessions,
  tok: NeedleTokenizer,
  query: string,
  tools: string,
): Promise<{ encoderOut: ort.Tensor; encTokens: number[] }> {
  const encTokens = tok.buildEncoderInput(query, tools, sessions.cfg.max_seq_len)
  const ids = BigInt64Array.from(encTokens, (v) => BigInt(v))
  const input = new ort.Tensor('int64', ids, [1, encTokens.length])
  const out = await sessions.enc.run({ input_ids: input })
  return { encoderOut: out['encoder_out'] as ort.Tensor, encTokens }
}

export async function* generate(
  sessions: NeedleSessions,
  tok: NeedleTokenizer,
  query: string,
  tools: string,
  opts: { maxGen?: number } = {},
): AsyncGenerator<GenStep> {
  const maxGen = opts.maxGen ?? 128
  const { cfg } = sessions
  const { encoderOut } = await encode(sessions, tok, query, tools)

  const headDim = cfg.d_model / cfg.num_heads
  // (num_decoder_layers, 2, batch=1, num_kv_heads, past_seq=0, head_dim)
  let pastKv = new ort.Tensor(
    'float32',
    new Float32Array(0),
    [cfg.num_decoder_layers, 2, 1, cfg.num_kv_heads, 0, headDim],
  )

  let nextId = tok.specials.eos
  const ids: number[] = []
  let fullText = ''

  for (let step = 0; step < maxGen; step++) {
    const decIds = BigInt64Array.from([BigInt(nextId)])
    const result = await sessions.dec.run({
      decoder_input_ids: new ort.Tensor('int64', decIds, [1, 1]),
      encoder_out: encoderOut,
      past_self_kv: pastKv,
    })
    // Dispose previous KV before reassigning.
    pastKv.dispose?.()
    pastKv = result['present_self_kv'] as ort.TypedTensor<'float32'>

    const logits = result['logits'] as ort.Tensor
    nextId = argmax(logits.data as Float32Array)
    logits.dispose?.()

    if (nextId === tok.specials.eos) break
    ids.push(nextId)

    const prevText = fullText
    fullText = tok.decode(ids)
    const newText = fullText.slice(prevText.length)
    yield { step, tokenId: nextId, newText, fullText, fullIds: [...ids] }
  }

  encoderOut.dispose?.()
  pastKv.dispose?.()
}
