import { SentencePieceProcessor } from '@sctg/sentencepiece-js'

export type Specials = {
  pad: number
  eos: number
  bos: number
  tool_call: number
  tools: number
}

export class NeedleTokenizer {
  private sp: SentencePieceProcessor | null = null
  specials: Specials = { pad: 0, eos: 1, bos: 2, tool_call: 4, tools: 5 }

  async load(modelBytes: ArrayBuffer, specials: Specials) {
    this.specials = specials
    const spp = new SentencePieceProcessor()
    // _loadModel accepts a Uint8Array — bypasses Node fs.
    await (spp as unknown as {
      _loadModel: (m: Uint8Array) => Promise<void>
    })._loadModel(new Uint8Array(modelBytes))
    this.sp = spp
  }

  encode(text: string): number[] {
    if (!this.sp) throw new Error('tokenizer not loaded')
    return Array.from(this.sp.encodeIds(text) as ArrayLike<number>)
  }

  decode(ids: number[]): string {
    if (!this.sp) throw new Error('tokenizer not loaded')
    return this.sp.decodeIds(Int32Array.from(ids)) as unknown as string
  }

  // Match Python: q[:max-2] + [TOOLS] + tools[:remaining]
  buildEncoderInput(query: string, tools: string, maxLen = 1024): number[] {
    const q0 = this.encode(query)
    const t0 = this.encode(normalizeTools(tools))
    const q = q0.slice(0, maxLen - 2)
    const remaining = maxLen - q.length - 1
    const t = t0.slice(0, Math.max(0, remaining))
    return [...q, this.specials.tools, ...t]
  }
}

function toSnakeCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
}

// Mirror needle.model.run.normalize_tools: snake_case tool names + compact JSON.
export function normalizeTools(toolsJson: string): string {
  try {
    const parsed: unknown = JSON.parse(toolsJson)
    if (Array.isArray(parsed)) {
      for (const t of parsed) {
        if (t && typeof t === 'object' && 'name' in t && typeof (t as { name: unknown }).name === 'string') {
          ;(t as { name: string }).name = toSnakeCase((t as { name: string }).name)
        }
      }
      return JSON.stringify(parsed)
    }
    return toolsJson
  } catch {
    return toolsJson
  }
}
