#!/usr/bin/env node
// Copies the exercise stills and animations next to a built app, as exercise-media/still and /clip:
//
//   node scripts/catalogue/stage-media.mjs frontend/dist                 web demo, 180 px from catalogue/media
//   APP_MEDIA_DIR=/private/app node scripts/catalogue/stage-media.mjs frontend/dist
//                                                                        Android package: larger animations
//   VITE_CLIP_EXT=webp APP_MEDIA_DIR=/private/app-webp ...              ... as animated WebP (the release)
//
// This fork ships no media (exercise GIFs come from ExerciseDB v1 and are cached on the device),
// so the script is a no-op here. Forks that still keep catalogue/media keep the original rule:
// 180 px may sit in the repository, a website or a self-hosted server; anything larger may only
// ever end up inside a compiled app package, so APP_MEDIA_DIR points at a private copy.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.argv[2] || 'frontend/dist')
const media = path.join(ROOT, 'catalogue/media')
// This fork removed the bundled media: exercise GIFs come from ExerciseDB v1 and are cached on
// the device. Forks that still keep catalogue/media stage it exactly as before.
if (!fs.existsSync(path.join(media, 'still'))) {
  console.log(`no catalogue/media to stage: ${out} keeps remote exercise media`)
  process.exit(0)
}
const appDir = process.env.APP_MEDIA_DIR
const clipExt = process.env.VITE_CLIP_EXT === 'webp' ? '.webp' : '.mp4'
if (clipExt === '.webp' && !appDir) {
  console.error('VITE_CLIP_EXT=webp needs APP_MEDIA_DIR: the repository only has the MP4 animations')
  process.exit(1)
}

const copyDir = (from, to, ext) => {
  fs.mkdirSync(to, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(from)) {
    if (!f.endsWith(ext)) continue
    fs.copyFileSync(path.join(from, f), path.join(to, f))
    n++
  }
  return n
}
const dest = path.join(out, 'exercise-media')
const stills = copyDir(path.join(media, 'still'), path.join(dest, 'still'), '.webp')
const clips = copyDir(appDir || path.join(media, 'clip'), path.join(dest, 'clip'), clipExt)
fs.copyFileSync(path.join(media, 'NOTICE.md'), path.join(dest, 'NOTICE.md'))
console.log(`media: ${stills} stills, ${clips} animations${appDir ? ' (app size)' : ''} -> ${path.relative(ROOT, out) || out}`)
