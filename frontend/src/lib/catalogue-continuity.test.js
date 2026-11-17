import { describe, expect, it } from 'vitest'
import { EXDB, EXIDX, exOr } from './exercises.js'
import V13_IDS from './catalogue-v13-ids.json' with { type: 'json' }

// Workouts, routines, records and backups store exercise ids. The 1597-exercise cut (the
// ExerciseDB v1 migration, docs/MEDIA_PLAN.md) removed ids that old data may still hold; they
// must degrade to a missing placeholder, never point at a different exercise.
describe('catalogue continuity', () => {
  it('resolves an id removed by the cut as missing, never as another exercise', () => {
    expect(V13_IDS).toHaveLength(1324)
    for (const id of V13_IDS) {
      if (EXIDX[id]) continue
      expect(exOr(id).missing, id).toBe(true)
    }
  })

  it('never lists one id twice', () => {
    expect(new Set(EXDB.map(e => e.id)).size).toBe(EXDB.length)
  })

  it('links every second drawing both ways, never to an unrelated exercise', () => {
    for (const e of EXDB) {
      // a hidden drawing resolves to this very exercise; a visible one points back with `mv`
      if (e.fv) expect(EXIDX[e.fv]?.id === e.id || EXIDX[e.fv]?.mv === e.id, e.id).toBe(true)
      if (e.mv) expect(EXIDX[e.mv]?.fv, e.id).toBe(e.id)
    }
  })
})
