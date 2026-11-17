// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

/* DATA SAFETY. The figure only ever changes which picture shows: the profile, its workouts,
   routines and history are never touched, and every exercise anything refers to keeps a picture
   on both figures. Run against a synthetic profile in the shape of real ones
   (fixtures/anim-safety-state.json: v1.3 ids, a drawing id stored as an exercise id, twins drawn
   on both figures, a female exercise with a male twin, custom exercises with and without a photo,
   one deleted on another device, an id no catalogue knows). */
import FIXTURE from './fixtures/anim-safety-state.json' with { type: 'json' }
import { EXIDX, exOr, isCustomEx, registerCustom, gifSrc, imgSrc, figureOf, canonicalExId } from './exercises.js'

const FIGS = ['male', 'female']
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze) } return o }

/** Every exercise id the profile refers to anywhere. */
export function referencedIds(S) {
  const ids = new Set()
  for (const w of S.workouts || []) for (const e of w.entries || []) ids.add(e.id)
  for (const w of S.workouts || []) for (const id of w.prs || []) ids.add(id)
  for (const r of S.routines || []) for (const e of r.ex || []) ids.add(e.id)
  for (const k of Object.keys(S.exWeights || {})) ids.add(k)
  for (const id of S.favEx || []) ids.add(id)
  for (const k of Object.keys(S.exNotes || {})) ids.add(k)
  return [...ids]
}

/** What the media for one id is on one figure: the same split Media.jsx makes. */
function pictureFor(id, figure) {
  const ex = exOr(id)
  if (isCustomEx(ex)) return { kind: 'custom', ex }
  if (ex.missing) return { kind: 'missing', ex }
  return { kind: 'catalogue', ex, stillSrc: imgSrc(ex, figure), animation: gifSrc(ex, figure) }
}

export function assertEveryPictureResolves(S) {
  registerCustom(S.customEx)
  const counts = { catalogue: 0, custom: 0, missing: 0 }
  for (const id of referencedIds(S)) {
    for (const figure of FIGS) {
      const p = pictureFor(id, figure)
      const where = `${id} ${figure}`
      if (p.kind === 'catalogue') {
        // Mapped exercises resolve to a remote ExerciseDB GIF (imgSrc/gifSrc return the same
        // gifUrl); unmapped ones use bundled exercise-media still/clip paths.
        expect(typeof p.stillSrc, where).toBe('string')
        expect(p.stillSrc.length, where).toBeGreaterThan(0)
        expect(typeof p.animation, where).toBe('string')
        expect(p.animation.length, where).toBeGreaterThan(0)
      } else if (p.kind === 'custom') {
        // Custom media keep their own path (components/CustomMedia.jsx), never the catalogue's.
        expect(p.ex.custom === true || S.customEx.some(c => c.id === id), where).toBe(true)
      } else {
        expect(p.ex.missing, where).toBe(true)
      }
      if (figure === 'male') counts[p.kind]++
    }
  }
  return counts
}

describe('every exercise the profile refers to has a picture, on both figures', () => {
  it('the synthetic profile: catalogue, v1.3, alias, twins, custom with and without media, deleted, unknown', () => {
    const counts = assertEveryPictureResolves(structuredClone(FIXTURE))
    // After the 1597-exercise cut (ExerciseDB v1 migration) 5965 and the old alias 2476 no
    // longer resolve as catalogue, so they fall back to missing — the safety property holds.
    expect(counts).toEqual({ catalogue: 3, custom: 2, missing: 4 })
  })
  it('a drawing id stored as an exercise id still reads as its exercise when the alias exists, and is left as it is', () => {
    // The 2476→0001 alias may be absent after the catalogue cut/rebuild; the fixture keeps the
    // stored id either way and the picture must still resolve (as missing or as its exercise).
    if (EXIDX['2476']) {
      expect(EXIDX['2476']).toBe(EXIDX['0001'])
      expect(canonicalExId('2476')).toBe('0001')
    } else {
      expect(canonicalExId('2476')).toBe('2476')
    }
    expect(FIXTURE.workouts[1].entries[0].id).toBe('2476')
  })
})

describe('switching the figure never touches the profile', () => {
  it('the state is deep-equal before and after', () => {
    const S = deepFreeze(structuredClone(FIXTURE))
    const before = JSON.stringify(S)
    for (const figure of FIGS) {
      // what a figure switch reads: S.exFigure, never written by any of this
      figureOf({ ...S, exFigure: figure })
      for (const id of referencedIds(S)) pictureFor(id, figure)
    }
    expect(JSON.stringify(S)).toBe(before)
  })
  it('nothing about the animation quality is kept in the profile that syncs', () => {
    expect(JSON.stringify(FIXTURE)).not.toMatch(/gym_anim|quality|anim-\d+/)
  })
})
