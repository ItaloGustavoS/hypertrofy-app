// Pure monetization helpers (AdMob + IAP): product id, ad visibility, purchase validation.
// No Capacitor imports here — the native wrappers live in mobile.js and are only ever
// loaded behind the MOBILE flag. This module is plain Node-loadable so its tests run
// in vitest (and the API can share the same constants if needed).

// The one-time, non-consumable product that removes ads forever. Must match the id
// created in Play Console + App Store Connect exactly.
export const PREMIUM_PRODUCT_ID = 'hypertrofy_premium_remove_ads'

// Platforms the server-side receipt validator knows how to check.
const PLATFORMS = ['android', 'ios']

// Whether the banner may render. adFree is undefined/null on legacy state (bump v1 -> v2
// hasn't migrated yet) — show ads by default, the premium flag is opt-in, not opt-out.
export const shouldShowAds = adFree => adFree !== true

// Validate a purchase payload before it leaves the device. Returns the normalized shape
// the server expects, or null when anything is missing or unknown — the caller must not
// guess a product id, token or platform on the server's behalf.
export function normalizePurchase(p) {
  if (!p || typeof p !== 'object') return null
  const { productId, purchaseToken, platform } = p
  if (typeof productId !== 'string' || !productId) return null
  if (typeof purchaseToken !== 'string' || !purchaseToken) return null
  if (productId !== PREMIUM_PRODUCT_ID) return null
  const plat = platform === undefined ? 'android' : platform
  if (!PLATFORMS.includes(plat)) return null
  return { productId, purchaseToken, platform: plat }
}

// Extract the platform for the server-side validator. Returns the concrete string or
// null — the server must never silently default to one vendor's API.
export function receiptPlatform(p) {
  if (!p || typeof p !== 'object') return null
  return PLATFORMS.includes(p.platform) ? p.platform : null
}

// Android hands back a purchaseToken; StoreKit 2 gives a transaction id (what the App Store
// Server API looks a transaction up by) plus the signed JWS. Either identifies the purchase.
const tokenOf = tx => tx?.purchaseToken || tx?.transactionId || tx?.jwsRepresentation || ''

// The store's own answer is the receipt. Play Billing and StoreKit 2 verify the transaction
// before the plugin resolves, and the published app has no server to ask, so a resolved
// transaction for our product is proof enough to unlock. A transaction for anything else, or
// one with no identifier, is refused — the same shape the Settings card already handles.
export function storePurchaseVerdict(tx, platform) {
  const payload = normalizePurchase({
    productId: tx?.productIdentifier || '',
    purchaseToken: tokenOf(tx),
    platform,
  })
  return { ok: !!payload }
}
