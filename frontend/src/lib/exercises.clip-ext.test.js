import { afterEach, describe, expect, it, vi } from 'vitest'

// The Android release shows its animations as animated WebP images (VITE_CLIP_EXT=webp); every
// other build keeps the MP4 loops. With the ExerciseDB v1 remote-media map, a catalogue exercise
// whose id is mapped resolves to its remote GIF URL instead of a bundled local clip; these tests
// use an unmapped synthetic id so they exercise the bundled-path logic.
describe('gifSrc and VITE_CLIP_EXT', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  // 'ZZ99' is not in the remote media map, so the resolver uses the bundled fallback.
  const ex = { id: 'ZZ99', img: 'ZZ99.webp', gif: 'ZZ99.mp4', fv: 'ZZ99F' }

  it('names MP4 loops by default', async () => {
    const { gifSrc, isVideoSrc } = await import('./exercises.js')
    expect(gifSrc(ex, 'male')).toBe('exercise-media/clip/ZZ99.mp4')
    expect(gifSrc(ex, 'female')).toBe('exercise-media/clip/ZZ99F.mp4')
    expect(isVideoSrc(gifSrc(ex, 'male'))).toBe(true)
  })

  it('names animated WebP images in the Android release', async () => {
    vi.stubEnv('VITE_CLIP_EXT', 'webp')
    const { gifSrc, imgSrc, isVideoSrc } = await import('./exercises.js')
    expect(gifSrc(ex, 'male')).toBe('exercise-media/clip/ZZ99.webp')
    expect(gifSrc(ex, 'female')).toBe('exercise-media/clip/ZZ99F.webp')
    expect(isVideoSrc(gifSrc(ex, 'male'))).toBe(false)
    expect(imgSrc(ex, 'male')).toBe('exercise-media/still/ZZ99.webp')
    // a fork's GIF stays a GIF
    expect(gifSrc({ ...ex, gif: 'ZZ99.gif', fv: undefined }, 'male')).toBe('exercise-media/clip/ZZ99.gif')
  })

  it('returns the remote GIF URL for a mapped catalogue exercise', async () => {
    const { gifSrc, imgSrc, remoteGifUrl } = await import('./exercises.js')
    // '0001' is in the ExerciseDB v1 map after the catalogue cut.
    const mapped = { id: '0001', n: '3/4 sit-up' }
    const url = remoteGifUrl(mapped)
    expect(url).toMatch(/^https:.*\.gif$/)
    expect(gifSrc(mapped, 'male')).toBe(url)
    expect(imgSrc(mapped, 'male')).toBe(url)
  })
})
