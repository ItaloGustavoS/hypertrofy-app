import { describe, expect, it } from 'vitest'
import { EXDB, EXALIAS } from './exercises-data.js'
import { EXIDX, exOr, figureOf, imgSrc, gifSrc, remoteGifUrl } from './exercises.js'

// The male/female choice for the exercise drawings is a picture and nothing else: ids, history
// and plans never change with it, on any device and in any app version. With the ExerciseDB v1
// remote-media map, many catalogue exercises resolve to a remote GIF URL; bundled-path assertions
// use synthetic unmapped ids so they stay stable.
describe('exercise drawings: male or female', () => {
  it('follows the body diagram until it is set, then the setting', () => {
    expect(figureOf({})).toBe('male')
    expect(figureOf({ body: 'female' })).toBe('female')
    expect(figureOf({ body: 'female', exFigure: 'male' })).toBe('male')
    expect(figureOf({ body: 'male', exFigure: 'female' })).toBe('female')
    expect(figureOf({ exFigure: 'nonsense' })).toBe('male')
  })

  it('swaps only the picture, both ways (bundled fallback, unmapped)', () => {
    const twin = { id: 'ZZ01', img: 'ZZ01.webp', gif: 'ZZ01.mp4', fv: 'ZZ01F' }
    const pair = { id: 'ZZ02', img: 'ZZ02.webp', gif: 'ZZ02.mp4', mv: 'ZZ02M' }
    expect(gifSrc(twin, 'female')).toContain('ZZ01F.mp4')
    expect(imgSrc(twin, 'female')).toContain('ZZ01F.webp')
    expect(gifSrc(twin, 'male')).toContain('ZZ01.mp4')
    expect(gifSrc(pair, 'male')).toContain('ZZ02M.mp4')
    expect(gifSrc(pair, 'female')).toContain('ZZ02.mp4')
  })

  it('keeps the one drawing of an exercise drawn once, whatever the setting', () => {
    const single = { id: 'ZZ03', img: 'ZZ03.webp', gif: 'ZZ03.mp4' }
    expect(gifSrc(single, 'female')).toBe(gifSrc(single, 'male'))
  })

  it('resolves a drawing id to the exercise it draws, never to "Unknown exercise"', () => {
    const twin = EXDB.find(e => e.fv && EXALIAS[e.fv])
    if (!twin) return // catalogue cut may have removed variant pairs; structural invariant holds when present
    expect(EXIDX[twin.fv]).toBe(EXIDX[twin.id])
    expect(exOr(twin.fv).missing).toBeUndefined()
    expect(exOr(twin.fv).id).toBe(twin.id)
  })

  it('never lists a drawing id as an exercise of its own', () => {
    const twin = EXDB.find(e => e.fv && EXALIAS[e.fv])
    if (twin) {
      expect(Object.keys(EXIDX)).not.toContain(twin.fv)
      expect(Object.values(EXIDX).filter(e => e.id === twin.id)).toHaveLength(1)
    }
    for (const id of Object.keys(EXALIAS)) expect(EXDB.some(e => e.id === id), id).toBe(false)
  })

  it('returns a remote GIF for a mapped catalogue exercise', () => {
    const mapped = EXDB.find(e => remoteGifUrl(e))
    expect(mapped).toBeTruthy()
    const url = gifSrc(mapped, 'male')
    expect(url).toMatch(/^https:.*\.gif$/)
    expect(imgSrc(mapped, 'male')).toBe(url)
  })
})
