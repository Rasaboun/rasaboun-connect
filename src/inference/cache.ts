import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'needle-v43'
const DB_VERSION = 1
const STORE = 'files'

let _db: Promise<IDBPDatabase> | null = null
function db() {
  if (!_db) {
    _db = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
      },
    })
  }
  return _db
}

export type Progress = { name: string; loaded: number; total: number }

export async function fetchCached(
  name: string,
  url: string,
  onProgress?: (p: Progress) => void,
): Promise<ArrayBuffer> {
  const d = await db()
  const hit = (await d.get(STORE, name)) as ArrayBuffer | undefined
  if (hit) {
    onProgress?.({ name, loaded: hit.byteLength, total: hit.byteLength })
    return hit
  }

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`fetch ${url}: ${resp.status}`)
  const total = Number(resp.headers.get('Content-Length') ?? 0)
  if (!resp.body) {
    const buf = await resp.arrayBuffer()
    await d.put(STORE, buf, name)
    onProgress?.({ name, loaded: buf.byteLength, total: buf.byteLength })
    return buf
  }

  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.({ name, loaded, total })
  }

  const merged = new Uint8Array(loaded)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  const buf = merged.buffer
  await d.put(STORE, buf, name)
  return buf
}

export async function clearCache() {
  const d = await db()
  await d.clear(STORE)
}

export async function estimateCacheSize(): Promise<number> {
  const d = await db()
  const keys = await d.getAllKeys(STORE)
  let total = 0
  for (const k of keys) {
    const v = (await d.get(STORE, k as string)) as ArrayBuffer | undefined
    if (v) total += v.byteLength
  }
  return total
}
