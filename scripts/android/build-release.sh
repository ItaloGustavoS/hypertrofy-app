#!/usr/bin/env bash
# Builds and signs the Android releases on the release machine:
#   Hypertrofy-<version>.apk   the sideloaded APK (GitHub, opengym.ch), updates itself
#   Hypertrofy-<version>.aab   the Google Play bundle, updated by Play
# Both come from the same phone build and the same key, so a phone can move from the APK to
# Google Play and keep its data (as long as Play App Signing uses this key too, see
# docs/APP_STORES.md). Exercise media is not bundled: the app fetches ExerciseDB GIFs and caches
# them on the device, so there is no media or asset-pack step here.
#
# Usage: scripts/android/build-release.sh <keystore> <password-file> <alias-file> [out-dir]
#   APK_ONLY=1    only the APK, no Play bundle
#   AAB_ONLY=1    only the Play bundle, no APK
#   GRADLE_ARGS   extra gradle arguments, e.g. "-Dorg.gradle.workers.max=2"
#   BUNDLETOOL    bundletool.jar to validate the bundle with
set -euo pipefail

KS=${1:?keystore}; PASS=${2:?file with the keystore password}; ALIAS=$(cat "${3:?file with the key alias}")
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${4:-$PWD}
export VITE_CLIP_EXT=webp
: "${ANDROID_HOME:?set ANDROID_HOME}"
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
GRADLE_ARGS=${GRADLE_ARGS:-}
if [ -n "${AAB_ONLY:-}" ] && [ -n "${APK_ONLY:-}" ]; then
  echo "APK_ONLY and AAB_ONLY together build nothing" >&2; exit 1
fi

cd "$ROOT/frontend"
VER=$(node -p "require('./package.json').version")
GRADLE_VER=$(sed -n 's/.*versionName "\(.*\)"/\1/p' android/app/build.gradle)
[ "$VER" = "$GRADLE_VER" ] || { echo "package.json says $VER, build.gradle says $GRADLE_VER" >&2; exit 1; }

npm run build:mobile

APK_BUILT="$OUT/.Hypertrofy-$VER-sideload-unsigned.apk"   # beside the outputs: the root disk may be small
if [ -z "${AAB_ONLY:-}" ]; then
  (cd android && ./gradlew --no-daemon $GRADLE_ARGS clean assembleSideloadRelease)
  cp android/app/build/outputs/apk/sideload/release/app-sideload-release-unsigned.apk "$APK_BUILT"
fi

sign_apk() {  # <unsigned> <name>
  "$BT/zipalign" -f -p 4 "$1" "$OUT/aligned.apk"
  "$BT/apksigner" sign --ks "$KS" --ks-pass "file:$PASS" --ks-key-alias "$ALIAS" \
    --out "$OUT/$2" "$OUT/aligned.apk"
  rm -f "$OUT/aligned.apk" "$OUT/$2.idsig"
  "$BT/apksigner" verify --print-certs "$OUT/$2" | grep -i "SHA-256"
  (cd "$OUT" && sha256sum "$2" > "$2.sha256")
}
if [ -z "${AAB_ONLY:-}" ]; then
  sign_apk "$APK_BUILT" "Hypertrofy-$VER.apk"
fi

if [ -n "${APK_ONLY:-}" ]; then
  rm -f "$APK_BUILT"
  ls -la "$OUT"/Hypertrofy-*"$VER".apk
  exit 0
fi

# The Play bundle is signed like a jar; Play checks it with the upload key and re-signs the APKs
# it builds from it with the app signing key.
(cd android && ./gradlew --no-daemon $GRADLE_ARGS ${AAB_ONLY:+clean} bundlePlayRelease)
AAB_IN=android/app/build/outputs/bundle/playRelease/app-play-release.aab
cp "$AAB_IN" "$OUT/Hypertrofy-$VER.aab"
# Only the store password from the file: -keypass:file on the same file fails, and without it
# jarsigner takes the store password for the key too.
jarsigner -keystore "$KS" -storepass:file "$PASS" \
  -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/Hypertrofy-$VER.aab" "$ALIAS" >/dev/null
jarsigner -verify "$OUT/Hypertrofy-$VER.aab" | grep -q "jar verified" || { echo "the bundle did not verify" >&2; exit 1; }

ls -la "$OUT"/Hypertrofy-*"$VER".apk "$OUT"/Hypertrofy-"$VER".aab 2>/dev/null || true
if [ -n "${BUNDLETOOL:-}" ]; then java -jar "$BUNDLETOOL" validate --bundle="$OUT/Hypertrofy-$VER.aab" >/dev/null && echo "bundletool validate: OK"; fi
# Google Play's limit: 500 MB for the base module.
BASE=$(unzip -l "$OUT/Hypertrofy-$VER.aab" | awk '$4 != "" {s+=$1} END {print s}')
echo "base module: $((BASE / 1024 / 1024)) MB (Play allows 500 MB)"
[ "$BASE" -lt $((500 * 1024 * 1024)) ] || { echo "the base module is over Play's 500 MB" >&2; exit 1; }
