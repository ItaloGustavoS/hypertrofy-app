# Hypertrofy

A gym and body-weight tracker for the phone. Everything lives on the device: no account, no
backend, no sync server. One banner ad, or a one-time purchase to remove it — that is the whole
business model.

**Hypertrofy is a fork of [openGym](https://github.com/DuarteSantos8/openGym)** by Duarte Santos,
which is self-hosted and AGPL-3.0. The training engine, the exercise catalogue and the interface
are his work; this fork changes how the app is packaged and paid for.

## What this fork changes

| area | change |
|---|---|
| **Monetization** | AdMob banner on the main screens, hidden on the workout and Settings screens; a one-time `hypertrofy_premium_remove_ads` purchase removes it for good |
| **Purchase** | Confirmed by the store's own signed transaction (Google Play Billing / StoreKit 2). There is no server to validate against, and none is needed |
| **MCP server** | Removed, along with its Nix package and CI jobs |
| **Admin dashboard** | Screens removed. The admin role, the `/api/admin/*` endpoints and the Coach configuration API stay — they are what a self-hosted instance uses |
| **Demo build** | Removed. No `VITE_DEMO`, no seeded data, no canned Coach answers |
| **`api/` dependencies** | Two: `@simplewebauthn/server` and `web-push`. No AI SDK, no HTTP client |
| **Brand** | New name, icon, bundle id `com.hypertrofy.app`, product id `hypertrofy_premium_remove_ads` |

Everything else — plans, routines, the 5,600-exercise catalogue, progression rules, rest timer,
measurements, progress photos, the AI Coach, wearables, CSV import/export, the self-hosted
server — is upstream's, unchanged.

## The app

The published app is the mobile build (`VITE_MOBILE=1`, Capacitor). It has no server to talk to:
the training log, photos, videos and settings stay in the app's private storage, with a JSON
backup you can export to a file or, on Android, to a folder of your choice. Signing in, sync,
push notifications and passkeys belong to the self-hosted build, not to this one.

## Build

```bash
cd frontend
npm install
npm run build            # web bundle
npx cap sync android     # or ios
```

The Android and iOS shells need their SDKs: JDK 21 + Android SDK for `./gradlew assembleRelease`,
macOS + Xcode for the iOS archive. The `android` job in CI builds a debug APK on every push that
touches `frontend/android`.

Banner ad units and the AdMob app id are per platform and per account; see `.env.example` and
`frontend/android/local.properties.example`. Unset means no banner at all.

## Where this is going

[`docs/RELEASE.md`](docs/RELEASE.md) lists what is still needed for a store release and in what
order; [`docs/REBRAND.md`](docs/REBRAND.md) covers the rename. The open item that matters most is
the exercise media licence below.

## Licence and attribution

This fork is **AGPL-3.0**, like the project it comes from. The original notice, copyright and the
app-store exception stay in [`NOTICE.md`](NOTICE.md) and [`LICENSE`](LICENSE); the source of this
fork is public at [ItaloGustavoS/hypertrofy-app](https://github.com/ItaloGustavoS/hypertrofy-app).

Upstream: [github.com/DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym) ·
[gitlab.com/DuarteSantos8/opengym](https://gitlab.com/DuarteSantos8/opengym).

> [!IMPORTANT]
> **The exercise media is not AGPL.** The stills and animations are © Aliaksandr Makatserchyk,
> [Gym visual](https://gymvisual.com/), licensed for use in openGym only. A non-commercial fork may
> keep them unmodified with the notice; a commercial one — this fork sells ad removal — needs its
> own licence from gymvisual.com. The exercise text in `catalogue/` is openGym's and open to
> contributions.
