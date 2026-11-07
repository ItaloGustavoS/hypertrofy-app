# Exercise media: ExerciseDB v1 (AscendAPI) — plan

Status: **planned** (source confirmed by user). Map generated. Not yet executed.

Decisions (verbatim intent, 2026-11-07): (1) reduzir/adequar para viabilidade, (2a) **cortar o catálogo para o que tem mídia grátis**, (3) **mídia baixada e cacheada** no aparelho — offline é simplificação de estrutura, o usuário tem internet 24h e o app tem anúncios, (4) **assumir que a licença/termos comerciais do app estão ok**. Source confirmed: **"sim" → ExerciseDB v1 (AscendAPI)**.

## Why
The bundled stills/animations are © Aliaksandr Makatserchyk / Gym visual (gymvisual.com), licensed for use in openGym/Hypertrofy only (not AGPL). A commercial build needs its own licence (`docs/RELEASE.md` §7 item 1). Replacing them with free, cacheable media clears that blocker (subject to decision 4).

## Comparison (measured)
Local catalogue: 5632 named exercises (6554 total; 922 variant stubs). Script: `scripts/compare-exercise-media.mjs` (exact name, then fuzzy Jaccard + equipment/target). Datasets: ExerciseDB v1 mirror (`scripts/_v1_exercises.json`, 1500, GIF 180p) vs yuhonas/free-exercise-db (876, Unlicense, static JPGs).

| source | matched | % of 5632 | high | media | licence |
|---|---:|---:|---:|---|---|
| **ExerciseDB v1 (chosen)** | **1597** | **28.4%** | 1360 | animated GIF 180p | terms to confirm (decision 4 assumes ok) |
| yuhonas/free-exercise-db | 482 | 8.6% | 223 | static JPG (2 frames) | Unlicense/public domain |
| union (either, high) | 1395 | 24.8% | — | — | — |

v1 wins on coverage (~3.3×), animated format, and `textSource:"exercisedb"` lineage. v1 uses **alphanumeric `exerciseId` + `gifUrl`** (no numeric `0001` IDs), so matching is by name/equipment/muscle.

## Generated artifact
`catalogue/exercise-media-map-v1.json` — **1597 entries**, key = local numeric id (`"0001"`), value = `{ exerciseId, gifUrl, confidence: "high"|"med", score, name }`. Regenerate: `node scripts/compare-exercise-media.mjs --emit catalogue/exercise-media-map-v1.json`.

## Execution steps (in order)
1. **Confirm terms (gate).** Decision 4 assumed commercial/caching/redistribution of the free v1 mirror is acceptable. Verify the actual terms before a store release; if they block commercial use, fall back to yuhonas (smaller, static) or obtain a licence.
2. **Cut the catalogue (2a).** Keep only the 1597 mapped exercises (and drop/flag the 922 variant stubs and 4035 unmatched). Preserve exercise text/metadata; remove dependence on bundled GymVisual media for the shipped set.
3. **Adapt the resolver.** `frontend/src/lib/exercises.js` currently resolves local paths (`exercise-media/still/*.webp`, `exercise-media/clip/*.mp4`, `imgSrc`/`gifSrc`/`isVideoSrc`). Add a media path that, for a mapped exercise, fetches `gifUrl` on first view and **caches it on device** (3) (Capacitor Filesystem on mobile / Cache Storage or IndexedDB on web), then serves the cached file. Keep a graceful fallback when offline and not yet cached. Adapt the display component(s) that assume still+clip/mp4/webm to render a cached GIF (or a converted format) — prefer keeping decoding simple (GIF) or converting once to an efficient cached asset.
4. **Remove GymVisual bundled media.** Delete `catalogue/media/still` and `catalogue/media/clip` (~220MB, 13109 files) from the repo/build once the cached path works, so the GymVisual licence no longer governs the shipped bundle.
5. **Update licensing/docs.** `NOTICE.md` and `README.md`: state that exercise media is sourced from ExerciseDB v1 and cached on device (and note yuhonas only if used); remove/qualify the GymVisual restriction for the shipped media (keep attribution history accurate in `CHANGELOG` if desired, but `CHANGELOG.md` stays as history). Update `docs/RELEASE.md` §7 item 1 to reflect the resolved media source, and record the terms-verification outcome.
6. **Verify.** `npm run build`, `cd api && npm test`, locale check; confirm mapped exercises render media, unmapped exercises degrade cleanly (no broken image where media is absent), and cache survives restart.

## Risks / notes
- **Coverage drop:** 5632 → ~1597 exercises (28%). This is the explicit trade (2a) to clear the licence blocker. Name mapping is heuristic; review the `med`-confidence 237 matches (or promote only `high` = 1360) before the cut.
- **Format:** current app uses still.webp + clip.mp4/webp; v1 gives GIF. The resolver/component contract changes — scope it carefully.
- **Terms not certified:** decision 4 assumed ok; the free mirror’s commercial/caching/redistribution terms must be confirmed (gate in step 1).
- **Network on first view:** with (3) caching, first render of an exercise needs connectivity; subsequent renders are local. Acceptable per the stated product assumption.
