// The pictures on a printed plan (#817): which file, the licence's size limit, the deadline, and
// the fallback to text. No real media file is read here: fetch, the store and the decode are
// stand-ins, and the bytes are a few placeholder bytes.
//
// After the ExerciseDB v1 migration the 1597 shipped catalogue exercises are mapped to remote
// GIFs (cached on device). printPictureSource returns null for those (no GymVisual still path to
// license/ship for print), so catalogue-still tests use synthetic unmapped EXIDX entries.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXIDX } from './exercises.js'
import {
  printPictureSource, loadPrintPictures, printedExerciseIds, isPrintPicture, PLACEHOLDER_PICTURE,
  PRINT_PICTURE_MAX_PX, readPrintPictures, writePrintPictures, PRINT_PICTURES_KEY,
} from './print-pictures.js'

const S = {
  unit: 'kg', week: {},
  routines: [
    { id: 'a', name: 'A', ex: [{ id: 'X001', sets: 3, reps: 5 }, { id: 'X002', sets: 3, reps: 8 }] },
    { id: 'b', name: 'B', ex: [{ id: 'X002', sets: 3, reps: 8 }, { id: 'X003', sets: 3, reps: 10 }] },
  ],
}
const okFetch = () => vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }) }))
const size = (w, h) => async () => ({ width: w, height: h })
const HASH = 'a'.repeat(64)
const PHASH = 'b'.repeat(64)
const custom = (media) => ({ id: 'c_mine', n: 'my move', custom: true, bp: 'chest', ...(media ? { media } : {}) })

// Synthetic unmapped catalogue-like exercises (not in the remote media map) so the still-path
// logic is exercised. Cleaned up after each test.
function addUnmapped() {
  EXIDX['X001'] = { id: 'X001', img: 'X001.webp', gif: 'X001.mp4', n: 'Test one', fv: 'X001F' }
  EXIDX['X002'] = { id: 'X002', img: 'X002.webp', gif: 'X002.mp4', n: 'Test two' }
  EXIDX['X003'] = { id: 'X003', img: 'X003.webp', gif: 'X003.mp4', n: 'Test three' }
}
function delUnmapped() { delete EXIDX['X001']; delete EXIDX['X002']; delete EXIDX['X003'] }

afterEach(() => { delUnmapped(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('./mobile.js') })

describe('printPictureSource', () => {
  it('is the catalogue still for an unmapped exercise, never an animation', () => {
    addUnmapped()
    const src = printPictureSource(S, 'X001')
    expect(src.kind).toBe('catalogue')
    expect(src.url).toMatch(/^exercise-media\/still\/[^/]+\.webp$/)
    expect(src.url).not.toMatch(/clip|anim-|\.mp4|\.gif/)
  })

  it('a remote-mapped catalogue exercise prints no picture (degrades to text)', () => {
    // 0001 is in the 1597-entry ExerciseDB v1 map.
    const src = printPictureSource(S, '0001')
    expect(src).toBeNull()
  })

  it('takes the drawing of the figure the profile shows (unmapped)', () => {
    addUnmapped()
    expect(printPictureSource({ ...S, exFigure: 'female' }, 'X001').url).toBe('exercise-media/still/X001F.webp')
  })

  it('in the phone app with larger built-in animations, still picks the 180 px still (unmapped)', async () => {
    addUnmapped()
    vi.resetModules()
    vi.stubEnv('VITE_BUILTIN_CLIP_PX', '1080')
    vi.stubEnv('VITE_CLIP_EXT', 'webp')
    vi.doMock('./mobile.js', async orig => ({ ...await orig(), MOBILE: true }))
    const pics = await import('./print-pictures.js')
    const { gifSrc, EXIDX: idx } = await import('./exercises.js')
    idx['X001'] = { id: 'X001', img: 'X001.webp', gif: 'X001.mp4', n: 'Test one' }
    const src = pics.printPictureSource(S, 'X001')
    expect(src.url).toMatch(/^exercise-media\/still\//)
    expect(gifSrc(idx['X001'])).toMatch(/clip\/.*\.webp$/)
    expect(src.url).not.toBe(gifSrc(idx['X001']))
  })

  it('a custom exercise prints its poster, a small photo itself, a link or nothing not at all', () => {
    const poster = { hash: PHASH, mime: 'image/webp', size: 2000, width: 480, height: 360 }
    const video = { kind: 'video', hash: HASH, mime: 'video/mp4', size: 5e6, width: 1920, height: 1080, poster }
    const photo = { kind: 'image', hash: HASH, mime: 'image/jpeg', size: 300000, width: 1200, height: 900 }
    const huge = { ...photo, size: 9e6 }
    expect(printPictureSource(S, 'x', { x: custom(video) })).toEqual({ kind: 'custom', file: poster })
    expect(printPictureSource(S, 'x', { x: custom(photo) }).file.hash).toBe(HASH)
    expect(printPictureSource(S, 'x', { x: custom(huge) })).toBeNull()
    expect(printPictureSource(S, 'x', { x: custom() })).toBeNull()
    expect(printPictureSource(S, 'nope')).toBeNull()
  })
})

describe('loadPrintPictures', () => {
  it('loads each printed unmapped exercise once, as a data URL', async () => {
    addUnmapped()
    const fetchImpl = okFetch()
    const out = await loadPrintPictures(S, { fetchImpl, decode: size(180, 180) })
    expect(Object.keys(out).sort()).toEqual(['X001', 'X002', 'X003'])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    for (const v of Object.values(out)) expect(isPrintPicture(v)).toBe(true)
    expect(fetchImpl.mock.calls.every(([u]) => u.startsWith('exercise-media/still/'))).toBe(true)
  })

  it('only one routine\'s exercises for a routine printout', async () => {
    addUnmapped()
    expect(printedExerciseIds(S, 'a')).toEqual(['X001', 'X002'])
    const out = await loadPrintPictures(S, { routineId: 'a', fetchImpl: okFetch(), decode: size(180, 180) })
    expect(Object.keys(out).sort()).toEqual(['X001', 'X002'])
  })

  it(`refuses a catalogue file larger than ${PRINT_PICTURE_MAX_PX} px`, async () => {
    addUnmapped()
    expect(await loadPrintPictures(S, { fetchImpl: okFetch(), decode: size(360, 360) })).toEqual({})
    expect(await loadPrintPictures(S, { fetchImpl: okFetch(), decode: size(180, 181) })).toEqual({})
  })

  it('leaves out what fails, does not decode or is not there', async () => {
    addUnmapped()
    let n = 0
    const fetchImpl = vi.fn(async url => {
      n++
      if (url.includes('X001')) throw new Error('offline')
      return n % 2 ? { ok: false } : { ok: true, blob: async () => new Blob([new Uint8Array([1])]) }
    })
    const out = await loadPrintPictures(S, { fetchImpl, decode: async () => null })
    expect(out).toEqual({})
  })

  it('stops waiting at the deadline and keeps what came in', async () => {
    addUnmapped()
    const fetchImpl = vi.fn(url => url.includes('X001')
      ? Promise.resolve({ ok: true, blob: async () => new Blob([new Uint8Array([1])]) })
      : new Promise(() => {}))
    const out = await loadPrintPictures(S, { fetchImpl, decode: size(180, 180), timeoutMs: 50 })
    expect(Object.keys(out)).toEqual(['X001'])
  })

  it('reads a custom photo from the local store, whatever its size in px', async () => {
    const photo = { kind: 'image', hash: HASH, mime: 'image/jpeg', size: 3, width: 1200, height: 900 }
    const S2 = { ...S, routines: [{ id: 'c', name: 'C', ex: [{ id: 'x', sets: 3, reps: 8 }] }] }
    const store = { get: vi.fn(async () => ({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) })) }
    const fetchImpl = vi.fn()
    const out = await loadPrintPictures(S2, { store, fetchImpl, decode: size(1200, 900), index: { x: custom(photo) } })
    expect(store.get).toHaveBeenCalledWith(HASH)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(out.x).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('the placeholder fills every picture without loading anything', async () => {
    addUnmapped()
    const fetchImpl = vi.fn()
    const out = await loadPrintPictures(S, { placeholder: true, fetchImpl })
    expect(Object.values(out)).toEqual([PLACEHOLDER_PICTURE, PLACEHOLDER_PICTURE, PLACEHOLDER_PICTURE])
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(isPrintPicture(PLACEHOLDER_PICTURE)).toBe(true)
  })
})

describe('the "With pictures" switch', () => {
  it('is on until this device turns it off, and survives storage that throws', () => {
    const mem = new Map()
    const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
    expect(readPrintPictures(storage)).toBe(true)
    writePrintPictures(false, storage)
    expect(mem.get(PRINT_PICTURES_KEY)).toBe('0')
    expect(readPrintPictures(storage)).toBe(false)
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
    expect(readPrintPictures(broken)).toBe(true)
    expect(() => writePrintPictures(true, broken)).not.toThrow()
  })

  it('only image data: URLs count as pictures', () => {
    expect(isPrintPicture('data:image/webp;base64,AAA')).toBe(true)
    expect(isPrintPicture('exercise-media/still/x.webp')).toBe(false)
    expect(isPrintPicture('javascript:alert(1)')).toBe(false)
    expect(isPrintPicture('data:text/html,<b>')).toBe(false)
  })
})
