// Reviewed catalogue IDs only: names alone also match stretches, holds and different movements.
// shortcut: unclassified movements use a labelled muscle/type fallback; extend families after review.
export const SUBSTITUTE_FAMILIES = {
  'flat press': ['0025', '0289', '1254', '0151', '0576', '0577', '0748', '0662'],
  'incline press': ['0047', '0314', '4544', '0169', '0757'],
  'decline press': ['0033', '0301', '0753'],
  'overhead press': ['0997', '0219', '0405', '0587', '1454', '0603', '0765', '0766'],
  row: ['0027', '0861', '0293', '1350', '1359'],
  'vertical pull': ['0198', '1326', '0652'],
  deadlift: ['0032', '0157', '0300', '0578', '0752'],
  'romanian deadlift': ['0085', '1459'],
  squat: ['1004', '0042', '0413', '0533', '0770'],
  lunge: ['0054', '0336'],
  curl: ['4063', '0031', '0868', '0294'],
  'hammer curl': ['0313'],
  pushdown: ['0201'],
  'lying triceps extension': ['0061', '0351'],
  'leg curl': ['0586', '0599'],
  'calf raise': ['1372', '1375', '0417', '0605'],
  'lateral raise': ['0907', '0178', '0334', '0584'],
}

const familyOf = new Map(Object.entries(SUBSTITUTE_FAMILIES).flatMap(([family, ids]) => ids.map(id => [id, family])))

// The caller applies equipment/search filters and favourite order before asking for suggestions.
export function suggestedSubstitutes(list, exercise) {
  const family = !exercise?.custom && familyOf.get(exercise?.id)
  if (!family || !exercise.tg) return []
  return list.filter(candidate => !candidate.custom && candidate.id !== exercise.id &&
    candidate.tg === exercise.tg && familyOf.get(candidate.id) === family).slice(0, 3)
}

// Prefer the same type and primary muscle, then related muscles, then a labelled type change.
export function relatedSubstitutes(list, exercise) {
  if (!exercise?.tg || !exercise.cat) return []
  const candidates = list.filter(candidate => candidate.id !== exercise.id)
  const sameType = candidates.filter(candidate => candidate.cat === exercise.cat)
  const sameMuscle = sameType.filter(candidate => candidate.tg === exercise.tg)
  if (sameMuscle.length) return sameMuscle.slice(0, 3)
  const muscles = new Set([exercise.tg, exercise.mg, ...(exercise.sm || [])].filter(Boolean))
  const related = sameType.filter(candidate => [candidate.tg, candidate.mg, ...(candidate.sm || [])].some(muscle => muscle && muscles.has(muscle)))
  return (related.length ? related : candidates.filter(candidate => candidate.tg === exercise.tg)).slice(0, 3)
}
