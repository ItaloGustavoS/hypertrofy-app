// Which kind of sideloaded APK this is. Every build now ships the same app (the ExerciseDB GIF
// is 180 px and remote), so a fresh build reads as Standard; the labels stay so older Plus/HD
// installs keep updating themselves (lib/update.js). Settings → About shows which one a phone
// has. Its own module so the About page can read it without the updater.
// The GIF ExerciseDB serves is 180 px; there is nothing larger built in any more.
const BUILTIN_PX = 180

const ENV = import.meta.env || {}
export const APK_VARIANTS = ['standard', 'plus', 'hd']
/** A build without VITE_APK_VARIANT goes by what it has built in. */
export const variantFor = (env, px = BUILTIN_PX) => APK_VARIANTS.includes(env)
  ? env
  : (px >= 360 ? 'hd' : px > 180 ? 'plus' : 'standard')
export const APK_VARIANT = variantFor(ENV.VITE_APK_VARIANT)
/** The kind's name as the download page and the file names call it. */
export const VARIANT_NAMES = { standard: 'Standard', plus: 'Plus', hd: 'HD' }
