# Release path

Status: planned. This is the order things have to happen in, and the decisions that gate each
step. Nothing here is started yet.

## 0. Rebrand first

See [`REBRAND.md`](REBRAND.md). It has to land before the store listings exist, because the
bundle id and the product id cannot be changed afterwards.

## 1. Compile

| target | command | needs |
|---|---|---|
| web | `cd frontend && npm run build` | nothing |
| api | `cd api && npm test` | nothing |
| Android | `cd frontend && npx cap sync android && cd android && ./gradlew assembleRelease` | JDK 21, Android SDK, a keystore |
| iOS | `cd frontend && npx cap sync ios`, then Xcode → Archive | macOS, Xcode, an Apple Developer account |

The CI `android` job (`.github/workflows/test.yml`) builds the debug variant on every push that
touches `frontend/android`, so a broken native change fails there before it reaches a device.

## 2. Test on a device

Only a device answers the questions the browser cannot:

- the banner appears, sits above the tab bar, and leaves the last row of content visible
  (`body.has-banner` is the class that reserves the space);
- the consent form appears once, and declining still lets the app run with non-personalised ads;
- the purchase sheet opens, completes, and flips Settings → Ads to "Ads are off";
- "Restore purchases" finds the purchase after a reinstall;
- airplane mode: no banner, no crash, and the app still works entirely offline;
- the Android auto-backup folder is named after the new brand, and an export/import round-trip
  survives it.

## 3. Blocking decision — receipt validation without a server

`purchasePremium()` calls `POST /api/purchase/validate`, and `api()` throws `not-paired` on a
phone that is not connected to a server (`frontend/src/lib/api.js`). The standalone app — the
one that keeps everything on the phone — has no server, so today a purchase there would be
charged and then answered "Purchase could not be verified". That is the one thing in this plan
that must be fixed before publishing.

| option | cost | risk |
|---|---|---|
| **Trust the store's own answer** (recommended). Play Billing and StoreKit 2 already return a verified, signed transaction on the device; for a non-consumable the platform also handles restore. Flip `adFree` from that result, and keep the server check for paired phones | small: a branch in `purchasePremium`/`restorePurchases` | a tampered device can fake it. The product is R$ 34,90 once — not worth a server |
| Require pairing | none | the app's whole selling point is that it needs no server |
| Run a validation service | a server, its cost, and the store credentials | a dependency the app otherwise does not have |

Recommendation: the first. It keeps the server path for self-hosters and makes the store the
source of truth on a standalone phone.

## 4. Store accounts and products

In this order, because each needs the previous one:

1. **Play Console** — create the app with `com.hypertrofy.app`; create the in-app product
   `hypertrofy_premium_remove_ads` (one-time, R$ 34,90); fill data safety and content rating;
   upload the first signed AAB.
2. **App Store Connect** — create the app with the same bundle id; create the same product id;
   privacy policy URL; App Privacy answers; upload the build through Xcode or Transporter.
3. **AdMob** — one app per platform, one banner unit per platform. Put the two unit ids in
   `frontend/.env` as `VITE_ADMOB_BANNER_ID_ANDROID` / `_IOS`, and the two App ids in
   `frontend/android/local.properties` (`admob.app.id`) and `frontend/ios/App/App/Info.plist`.
   The repository ships Google's test ids: builds work, ads are test ads, no revenue.
4. **Server credentials** (only if self-hosted instances validate receipts) — Play service
   account JSON and the App Store `.p8`, mounted as described in `.env.example`.

## 5. Release plumbing

- **Android keystore** — generate once, keep it out of the repository, and never lose it. The
  same key has to sign every future update.
- **`fastlane/metadata`** — title, short and long description, keywords, and screenshots. The
  screenshots show the UI, so they are retaken after the rebrand.
- **Version** — `frontend/package.json` and `frontend/android/app/build.gradle` have to agree;
  the app shows the version in Settings.
- **Privacy policy** — required by both stores, and by AdMob because the app serves ads. It has
  to name AdMob, the purchase, and the fact that training data never leaves the phone.

## 6. After the first release

- Watch the api logs for `iap.validate` failures; a `501` means a store credential is missing
  and every buyer is being refused.
- Watch AdMob fill rate and eCPM for a week before deciding the price of the removal.
- The removal purchase is the only revenue; if it does not convert, the lever is the banner
  placement, not a new product.
