// Where an exercise's animation comes from. The store apps used to download animation packs
// (240 to 1080 px); those are gone, so every build shows the ExerciseDB v1 GIF (fetched and
// cached on the device) or a fork's bundled clip.
import { gifSrc, remoteGifUrl } from '../lib/exercises.js'

export function useAnimSources(ex, figure) {
  const builtin = (ex?.gif || remoteGifUrl(ex)) ? gifSrc(ex, figure) : null
  return { still: false, sources: builtin ? [builtin] : [] }
}
