// Device cache for the remote exercise media (ExerciseDB v1 GIFs): the first view fetches the GIF
// and stores it in Cache Storage, so later views and restarts read it locally. The cache is capped
// and evicts the least recently used GIFs, so a long-lived install cannot grow without bound; the
// index in localStorage is what tells the two apart (Cache Storage has no sizes of its own).
// The in-memory blob URL avoids re-reading the cache on every render.
const CACHE = 'hypertrofy-exercise-media-v1'
const INDEX_KEY = 'hypertrofy-media-index-v1'
/** The whole 1,597-GIF library measures about 148 MB on device (95 KB each, measured Nov 2026), so
    this fits all of it; it is there so a larger source or a long life cannot fill the phone. */
export const CACHE_CAP = 150 * 1024 * 1024
const inflight = new Map()
const blobUrls = new Map()

export const isRemoteExerciseMedia = src =>
  typeof src === 'string' && /^https?:\/\//i.test(src) && src.includes('/media/') && /\.gif(\?|$)/i.test(src)

function readIndex () {
  if (typeof localStorage === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {} } catch { return {} }
}
function writeIndex (ix) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ix)) } catch {}
}

/** How many bytes of animations this device holds. */
export function mediaCacheBytes () {
  return Object.values(readIndex()).reduce((n, e) => n + (e.size || 0), 0)
}

/** Forget every downloaded animation: the next view fetches it again. */
export async function clearExerciseMediaCache () {
  for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  blobUrls.clear()
  inflight.clear()
  synced = null
  writeIndex({})
  if (typeof caches === 'undefined') return
  try { await caches.delete(CACHE) } catch {}
}

async function sizeOf (res) {
  const n = Number(res.headers.get('content-length'))
  if (n > 0) return n
  try { return (await res.clone().blob()).size } catch { return 0 }
}

// The index of a cache written before the cap existed is empty: reconcile it once per start, so
// eviction counts those GIFs too. A cache the browser dropped on its own loses its entries here.
let synced = null
function syncIndex () {
  if (synced) return synced
  synced = (async () => {
    const ix = readIndex()
    if (typeof caches === 'undefined') return ix
    try {
      const cache = await caches.open(CACHE)
      const keys = await cache.keys()
      const live = new Set(keys.map(r => r.url))
      for (const src of Object.keys(ix)) if (!live.has(src)) delete ix[src]
      for (const req of keys) {
        if (ix[req.url]) continue
        const res = await cache.match(req)
        if (res) ix[req.url] = { size: await sizeOf(res), at: 0 }
      }
      writeIndex(ix)
    } catch {}
    return ix
  })()
  return synced
}

/** Drop the least recently used GIFs until the cache fits the cap. */
async function enforceCap () {
  const ix = await syncIndex()
  let total = Object.values(ix).reduce((n, e) => n + (e.size || 0), 0)
  if (total <= CACHE_CAP || typeof caches === 'undefined') return
  let cache
  try { cache = await caches.open(CACHE) } catch { return }
  for (const [src, e] of Object.entries(ix).sort((a, b) => (a[1].at || 0) - (b[1].at || 0))) {
    if (total <= CACHE_CAP) break
    try { await cache.delete(src) } catch {}
    total -= e.size || 0
    delete ix[src]
    const url = blobUrls.get(src)
    if (url) { URL.revokeObjectURL(url); blobUrls.delete(src) }
  }
  writeIndex(ix)
}

async function fromCache (src) {
  if (typeof caches === 'undefined') return null
  try {
    const c = await caches.open(CACHE)
    const hit = await c.match(src)
    if (!hit) return null
    const ix = await syncIndex()
    if (ix[src]) { ix[src].at = Date.now(); writeIndex(ix) }
    const blob = await hit.blob()
    const url = URL.createObjectURL(blob)
    blobUrls.set(src, url)
    return url
  } catch { return null }
}

async function fetchAndCache (src) {
  if (blobUrls.has(src)) return blobUrls.get(src)
  const cached = await fromCache(src)
  if (cached) return cached
  if (inflight.has(src)) return inflight.get(src)
  const p = (async () => {
    try {
      const res = await fetch(src, { mode: 'cors' })
      if (!res.ok) throw new Error(res.status)
      const blob = await res.blob()
      if (typeof caches !== 'undefined') {
        try {
          const c = await caches.open(CACHE)
          await c.put(src, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/gif', 'Content-Length': String(blob.size) } }))
          const ix = await syncIndex()
          ix[src] = { size: blob.size, at: Date.now() }
          writeIndex(ix)
          await enforceCap()
        } catch { /* cache write best-effort; blob still displays */ }
      }
      const url = URL.createObjectURL(blob)
      blobUrls.set(src, url)
      return url
    } catch {
      return src // fall back remote URL; browser HTTP cache may still help
    } finally {
      inflight.delete(src)
    }
  })()
  inflight.set(src, p)
  return p
}

/** Resolve media src displayable URL, caching remote exercise GIFs on device. */
export async function cachedExerciseSrc (src) {
  if (!src) return src
  if (blobUrls.has(src)) return blobUrls.get(src)
  if (!isRemoteExerciseMedia(src)) return src
  return fetchAndCache(src)
}

/** Warm the device cache without blocking UI (prefetch). */
export function prefetchExerciseMedia (src) {
  if (!isRemoteExerciseMedia(src) || blobUrls.has(src)) return
  fetchAndCache(src).catch(() => {})
}
