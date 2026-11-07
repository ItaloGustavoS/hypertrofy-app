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

## 3. Receipt validation — decided: trust the store

The published app has no server, so there is nothing to validate against. `purchasePremium()`
and `restorePurchases()` take the transaction the store resolves as the receipt: Play Billing and
StoreKit 2 verify it on the device before the plugin answers, and
`storePurchaseVerdict()` in `frontend/src/lib/monetization.js` accepts it only for
`hypertrofy_premium_remove_ads`.

The server-side validator (`api/purchase.js`, `POST /api/purchase/validate`) stays for a
self-hosted instance that wants it. The app no longer calls it, and `frontend/src/lib/api.js` no
longer exports the wrapper.

Trade-off, accepted: a tampered device can fake the unlock. The product is R$ 34,90 once, and a
validation service would cost more than it protects.

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

## 7. What is still needed, in order

Everything here is deliberately deferred until the app compiles and passes the device checks.
The first two block the store entries themselves, because the ids are permanent.

| # | need | blocks | owner |
|---|---|---|---|
| 1 | **Exercise media licence** from [gymvisual.com](https://gymvisual.com/) — the stills and animations are licensed to Hypertrofy only, and a commercial fork needs its own | any store upload | you |
| 2 | **Rebrand**, commits 1–3 of [`REBRAND.md`](REBRAND.md) | creating the store entries | code |
| 3 | JDK 21 + Android SDK + a release keystore, generated once and backed up | Android release build | you |
| 4 | macOS + Xcode + an Apple Developer account | iOS archive | you |
| 5 | Play Console: app `com.hypertrofy.app`, product `hypertrofy_premium_remove_ads` at R$ 34,90, data-safety form | Android listing | you |
| 6 | App Store Connect: same ids, App Privacy answers, privacy-policy URL | iOS listing | you |
| 7 | AdMob: app plus one banner unit per platform, into `VITE_ADMOB_BANNER_ID_ANDROID`/`_IOS`, `admob.app.id`, and the iOS `GADApplicationIdentifier` | ads actually serving | you |
| 8 | Privacy policy, hosted at a public URL | both listings | you |
| 9 | Screenshots retaken after the icon and name change | both listings | you |
| 10 | The device pass in section 2, on a real phone with a real store account | release | you |
| 11 | `fastlane/metadata` text updated to the new name, and a tagged GitHub release | publishing | code |
