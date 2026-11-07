# Rebrand: Hypertrofy → Hypertrofy

Status: planned, not started. Decisions below were taken on 2026-11-07.

The branch is `hypertrofy-port-v2`, cut from upstream v1.4.4. Upstream keeps moving, so the
rebrand is built to survive a periodic rebase: every change is either an identifier that only
lives in a handful of files, or a mechanical rename that a script can replay.

## Decisions

| question | answer |
|---|---|
| Bundle id / applicationId | `com.hypertrofy.app` |
| Product id (remove ads) | `hypertrofy_premium_remove_ads` |
| Scope of the old name | app, store metadata and server. Docs and website in a later commit |
| Visual identity | new icon, current dark + lime palette kept |
| Licence | public fork, AGPL source available, upstream attribution kept |
| Upstream | still rebased periodically; the rebrand stays in isolated commits |

## The three things that cannot be changed after the first upload

1. **`com.hypertrofy.app`** — the app's identity in both stores, and what deep links, push,
   passkeys, the Android backup folder and the iOS app group hang off.
2. **`hypertrofy_premium_remove_ads`** — must be created under this name in Play Console and
   App Store Connect. Renaming later means a new product and a migration for everyone who
   already bought.
3. **The Android signing key.** If the account changes, the new APK cannot update over the old
   one. Nothing to do in this repository; it is a store-account decision.

## What the name touches

Measured on `hypertrofy-port-v2` (files excluded: binaries, `catalogue/media`, `node_modules`):

| area | refs | nature |
|---|---|---|
| 19 locale packs | 4 145 | ~220 per pack, brand name is not translated |
| `frontend/src` outside locales | ~1 900 | titles, share text, manifest, tests |
| `frontend/ios` | 1 020 | bundle ids, app group, widget, keychain, Swift comments |
| `frontend/android` | 696 | applicationId, package paths, manifest, gradle |
| `docs` | 417 | deferred to the last commit |
| `website` | 304 | deferred |
| `fastlane` | 102 | store listing text |
| `api` | 99 | push copy, nudge, wrapped, Coach prompts |
| `contrib` (nix, helm, k8s) | 119 | package/service names, deferred |

## Commit 1 — identity

The smallest diff that changes what the stores and the OS see.

- `frontend/capacitor.config.json`: `appId` → `com.hypertrofy.app`, `appName` → `Hypertrofy`.
- `frontend/android/app/build.gradle`: `namespace` and `applicationId`.
- Android sources: move `java/ch/duartesantos/opengym` → `java/com/hypertrofy/app` in all
  three source sets (`main`, `fdroid`, `gms`) and rewrite the `package` line in each of the
  32 + flavour files. The manifest names the activity by full class, so it moves too.
- `frontend/android/app/src/main/res/values/strings.xml`: `app_name`, `title_activity_main`,
  `package_name`, `custom_url_scheme`.
- iOS: `PRODUCT_BUNDLE_IDENTIFIER` (`ch.opengym.app` → `com.hypertrofy.app`, note upstream is
  inconsistent with Capacitor here), `CFBundleDisplayName` in the app and the widget,
  `CFBundleURLName`, the app group `group.ch.opengym.app` → `group.com.hypertrofy.app` in both
  `.entitlements` files and every `Info.plist` that repeats it, the nudge task id, and the
  keychain `kSecAttrService` fallbacks.
- The widget target keeps its folder name (`HypertrofyWidgets`) for now: renaming it means
  editing the Xcode project by hand, and the name is not user-visible. Revisit on a Mac.
- Product id: `frontend/src/lib/monetization.js`, its test, `api/purchase.js`,
  `api/openapi.yaml`, `.env.example` prose.
- `package.json` names (`opengym-frontend` → `hypertrofy-frontend`), root `package.json`.

Verification: `grep -r ch.duartesantos.opengym` and `grep -r ch.opengym` return only history;
`npx cap sync` succeeds; the `android` job in `.github/workflows/test.yml` builds. Local build
is not possible without a JDK/Android SDK.

## Commit 2 — the name, everywhere the user can see it

- Locales: `Hypertrofy` → `Hypertrofy` in all 19 packs, same spelling everywhere.
- `frontend/src` strings, `frontend/public/manifest.json`, `index.html`, share text, the
  backup filename `opengym-backup-*.json` → `hypertrofy-backup-*.json`, and the Android
  auto-backup folder `AUTO_BACKUP_DIR` in `frontend/src/lib/mobile.js`.
- Server: `api/nudge-copy.js`, `api/wrapped-copy.js` (regenerated through
  `scripts/build-wrapped-copy.mjs`, never hand-edited — a test compares it byte for byte),
  `api/push-messages.js`, and the Coach prompts under `api/coach/prompts/` plus
  `api/coach/core/system-prompt.js`.

The rename is applied by `scripts/rebrand.mjs` (dry run by default, prints every changed line,
restricted to a fixed file list). That script is also how the rename is replayed after each
upstream rebase, instead of resolving the same conflicts by hand every release.

Verification: `node scripts/check-locales.mjs` (19 × 3624), `cd api && npm test` (the wrapped
test is the one that catches a missed regeneration), `npm run build`.

## Commit 3 — icon, store assets, docs

- `frontend/resources/icon.svg` is the single source; `npx @capacitor/assets generate`
  produces the Android adaptive set, the iOS `AppIcon` set, the splash and the PWA icons in
  `frontend/public`. Palette stays `#0c0e12` / `#a3e635` unless the new mark needs a second
  colour.
- `fastlane/metadata/**`: title, short and long description, and the screenshots — the
  screenshots show the old name in the UI and have to be retaken on a device, so they are the
  one part of this plan that cannot be automated.
- Docs and website: mechanical, last, and deliberately isolated so an upstream rebase can drop
  or replay that commit without touching code.

## What must not change

- `CHANGELOG.md` — history, and the old name in it is accurate.
- `NOTICE.md`, `LICENSE`, the copyright line and the app-store exception paragraph. AGPL v3
  requires the notice to stay, and the source stays public at the fork.
- Upstream issue and repository links inside code comments.
- `frontend/src/lib/demo.js`'s `REPO` — it is the attribution link shown in Login and About.
  It must point at **our** public repository once that exists; until then it is a known
  placeholder (see open items).

## Open items

1. **Public repository URL** — needed for `REPO`, `NOTICE.md` and the store listing's privacy
   and source links.
2. **Apple app group** — `group.com.hypertrofy.app` has to be registered in the Apple Developer
   portal before the widget builds.
3. **Store accounts and credentials** — the AdMob app ids are Google's test values, and
   `POST /api/purchase/validate` answers `501` until the Play service account and the App
   Store `.p8` key exist.
4. **Screenshots** — manual, after the icon lands.
5. **JDK / Android SDK and Xcode** — neither is on the current machine; both native builds are
   verified by CI and by a release machine.
