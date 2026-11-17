// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_CAP, cachedExerciseSrc, clearExerciseMediaCache, mediaCacheBytes, prefetchExerciseMedia } from './exercise-media-cache.js'

/* The device cache for the ExerciseDB GIFs: one fetch per GIF, kept across views, and capped so a
   long-lived install cannot fill the phone. Cache Storage is a stand-in here; the sizes of the
   big entries come from the index, which is what eviction reads. */
const CACHE = 'hypertrofy-exercise-media-v1'
const INDEX = 'hypertrofy-media-index-v1'
const GIF = n => `https://cdn.example.com/media/exercise-${n}.gif`

class FakeCache {
  constructor () { this.map = new Map() }
  async put (req, res) { this.map.set(String(req), res) }
  async match (req) { return this.map.get(String(req)) }
  async delete (req) { return this.map.delete(String(req)) }
  async keys () { return [...this.map.keys()].map(url => ({ url })) }
}
const store = new Map()
const cachesStub = {
  async open (name) { if (!store.has(name)) store.set(name, new FakeCache()); return store.get(name) },
  async delete (name) { return store.delete(name) },
}
const index = () => JSON.parse(localStorage.getItem(INDEX) || '{}')

beforeEach(async () => {
  await clearExerciseMediaCache()
  store.clear()
  localStorage.clear()
  vi.stubGlobal('caches', cachesStub)
  URL.createObjectURL = vi.fn(() => 'blob:cached')
  URL.revokeObjectURL = vi.fn()
})

describe('cachedExerciseSrc', () => {
  it('fetches a GIF once and serves it from the cache after that', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['x'], { type: 'image/gif' })))
    vi.stubGlobal('fetch', fetchImpl)
    expect(await cachedExerciseSrc(GIF(1))).toBe('blob:cached')
    expect(await cachedExerciseSrc(GIF(1))).toBe('blob:cached')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(index()[GIF(1)].size).toBe(1)
    expect(mediaCacheBytes()).toBe(1)
  })

  it('leaves a local picture alone, and prefetches only the remote ones', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(['x'])))
    vi.stubGlobal('fetch', fetchImpl)
    expect(await cachedExerciseSrc('exercise-media/still/0001.webp')).toBe('exercise-media/still/0001.webp')
    prefetchExerciseMedia('exercise-media/still/0001.webp')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to the remote URL when the download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await cachedExerciseSrc(GIF(2))).toBe(GIF(2))
  })
})

describe('the cap', () => {
  it('drops the least recently used GIFs until the cache fits', async () => {
    const cache = await cachesStub.open(CACHE)
    const big = 100 * 1024 * 1024
    // Two entries already on disk, the first one older: adding a third must evict it.
    const seed = {}
    for (const [n, at] of [[1, 1], [2, 2]]) {
      await cache.put(GIF(n), new Response(new Blob(['x'])))
      seed[GIF(n)] = { size: big, at }
    }
    localStorage.setItem(INDEX, JSON.stringify(seed))
    expect(mediaCacheBytes()).toBe(2 * big)
    expect(2 * big).toBeGreaterThan(CACHE_CAP)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['y']), { headers: { 'Content-Length': '1' } })))
    await cachedExerciseSrc(GIF(3))
    const ix = index()
    expect(ix[GIF(1)]).toBeUndefined()
    expect(ix[GIF(2)]).toBeDefined()
    expect(ix[GIF(3)]).toBeDefined()
    expect(await cache.match(GIF(1))).toBeUndefined()
    expect(mediaCacheBytes()).toBeLessThanOrEqual(CACHE_CAP)
  })
})

describe('clearExerciseMediaCache', () => {
  it('forgets every downloaded GIF and the index with it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
    await cachedExerciseSrc(GIF(4))
    expect(mediaCacheBytes()).toBe(1)
    await clearExerciseMediaCache()
    expect(mediaCacheBytes()).toBe(0)
    expect(store.has(CACHE)).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cached')
  })
})
