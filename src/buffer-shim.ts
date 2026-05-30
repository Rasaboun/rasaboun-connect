import { Buffer } from 'buffer'

declare global {
  var Buffer: typeof import('buffer').Buffer
}

// `@sctg/sentencepiece-js` calls Buffer.from() to decode its base64 models.
// In the browser, Buffer is not a global — pre-attach it before that module loads.
globalThis.Buffer = Buffer
