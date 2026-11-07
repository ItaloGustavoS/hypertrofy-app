// Device cache for remote exercise media (ExerciseDB v1 GIFs). First view fetches the
// GIF and stores it in Cache Storage so later views (and restarts) read it locally,
// matching decision (3): downloaded and cached on the device. The in-memory blob URL
// avoids re-reading the cache on every render.

const CACHE = 'hypertrofy-exercise-media-v1'
const inflight = new Map()
const blobUrls = new Map()

export const isRemoteExerciseMedia = src =>
  typeof src === 'string' && /^https?:\/\//i.test(src) && src.includes('/media/') && /\.gif(\?|$)/i.test(src)

async function fromCache(src) {
  if (typeof caches === 'undefined') return null
  try {
    const c = await caches.open(CACHE)
    const hit = await c.match(src)
    if (!hit) return null
    const blob = await hit.blob()
    const url = URL.createObjectURL(blob)
    blobUrls.set(src, url)
    return url
  } catch { return null }
}

async function fetchAndCache(src) {
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
          await c.put(src, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/gif' } }))
        } catch { /* cache write is best-effort; the blob still displays */ }
      }
      const url = URL.createObjectURL(blob)
      blobUrls.set(src, url)
      return url
    } catch {
      return src // fall back to the remote URL; browser HTTP cache may still help
    } finally {
      inflight.delete(src)
    }
  })()
  inflight.set(src, p)
  return p
}

// Resolve a media src to a displayable URL, caching remote exercise GIFs on device.
export async function cachedExerciseSrc(src) {
  if (!src) return src
  if (blobUrls.has(src)) return blobUrls.get(src)
  if (!isRemoteExerciseMedia(src)) return src
  return fetchAndCache(src)
}

// Warm the device cache without blocking the UI (prefetch).
export function prefetchExerciseMedia(src) {
  if (!isRemoteExerciseMedia(src) || blobUrls.has(src)) return
  fetchAndCache(src).catch(() => {})
}
