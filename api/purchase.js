// IAP receipt validation for POST /api/purchase/validate (mobile monetization).
//
// The client never trusts the store response alone: purchasePremium()/restorePurchases()
// (frontend/src/lib/mobile.js) send { productId, purchaseToken, platform } here, and only
// { adFree: true } unlocks the premium flag. Fail-closed throughout: anything unrecognized,
// expired, refunded, or unconfigured answers { ok: false } — never premium by default.
//
// No new dependencies (api/ stays at 2): the Google OAuth handshake and the Apple JWT are
// signed by hand with node:crypto, and the vendor calls go over the global fetch.
import crypto from 'node:crypto';
import fs from 'node:fs';

// Duplicated (not imported) from frontend/src/lib/monetization.js — a tiny pure constant,
// not worth sharing across the two runtimes.
export const PREMIUM_PRODUCT_ID = 'openGym_premium_remove_ads';
const PLATFORMS = ['android', 'ios'];

const b64u = s => Buffer.from(s).toString('base64url');
const unb64u = s => JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'));

// Shape check only — the vendor call decides validity. platform is never defaulted here:
// the client may assume android for a missing value, the server must not guess the vendor.
export function normalizePayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, code: 400, error: 'payload required' };
  const { productId, purchaseToken, platform } = body;
  if (productId !== PREMIUM_PRODUCT_ID) return { ok: false, code: 400, error: 'unknown product' };
  if (typeof purchaseToken !== 'string' || !purchaseToken) return { ok: false, code: 400, error: 'purchase token required' };
  if (!PLATFORMS.includes(platform)) return { ok: false, code: 400, error: 'platform must be android or ios' };
  return { ok: true, productId, purchaseToken, platform };
}

export async function validatePurchase(body, env = process.env, http = fetch) {
  const norm = normalizePayload(body);
  if (!norm.ok) return norm;
  try {
    if (norm.platform === 'android') return await validateAndroid(norm, env, http);
    return await validateApple(norm, env, http);
  } catch (e) {
    // Vendor unreachable, bad credentials on disk, malformed JWS — all fail closed.
    console.error('iap validate failed', norm.platform, e.message);
    return { ok: false, code: 500, error: 'validation backend error' };
  }
}

/* ---------- Google Play (Android) ---------- */

// The OAuth access token outlives one validation, so it is cached in memory until shortly
// before it expires. Exported only so tests can reset it between stubbed vendors.
let playToken = null, playExp = 0;
export function _resetPlayCache() { playToken = null; playExp = 0; }

function googleJWT(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), sa.private_key).toString('base64url');
  return head + '.' + claim + '.' + sig;
}

async function playAccessToken(sa, http) {
  if (playToken && Date.now() < playExp - 60000) return playToken;
  const r = await http('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')
      + '&assertion=' + googleJWT(sa)
  });
  if (!r.ok) throw new Error('google oauth ' + r.status);
  const data = await r.json();
  if (!data.access_token) throw new Error('google oauth: no token');
  playToken = data.access_token;
  playExp = Date.now() + (+data.expires_in || 3600) * 1000;
  return playToken;
}

async function validateAndroid({ productId, purchaseToken }, env, http) {
  const saPath = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const pkg = env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!saPath || !pkg) return { ok: false, code: 501, error: 'iap-not-configured' };
  let sa;
  try { sa = JSON.parse(fs.readFileSync(saPath, 'utf8')); }
  catch { return { ok: false, code: 500, error: 'iap backend error' }; }
  if (!sa.client_email || !sa.private_key) return { ok: false, code: 500, error: 'iap backend error' };
  const token = await playAccessToken(sa, http);
  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
    + encodeURIComponent(pkg) + '/purchases/products/' + encodeURIComponent(productId)
    + '/tokens/' + encodeURIComponent(purchaseToken);
  const r = await http(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404 || r.status === 410) return { ok: false, code: 400, error: 'receipt not recognized' };
  if (!r.ok) throw new Error('play api ' + r.status);
  const data = await r.json();
  // purchaseState 0 = purchased; 1 = cancelled (refunded); 2 = pending — only 0 unlocks.
  if (data.purchaseState === 0) return { ok: true };
  return { ok: false, code: 400, error: 'receipt not recognized' };
}

/* ---------- App Store Server API (iOS) ---------- */

function appleJWT(env, key) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }));
  const claim = b64u(JSON.stringify({
    iss: env.APPLE_ISSUER_ID, iat: now, exp: now + 3600,
    aud: 'appstoreconnect-v1', bid: env.APPLE_BUNDLE_ID
  }));
  // JWS wants the raw R||S signature, which is what ieee-p1363 selects (not DER).
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claim),
    { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return head + '.' + claim + '.' + sig;
}

async function validateApple({ productId, purchaseToken }, env, http) {
  const { APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH, APPLE_BUNDLE_ID } = env;
  if (!APPLE_ISSUER_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY_PATH || !APPLE_BUNDLE_ID) {
    return { ok: false, code: 501, error: 'iap-not-configured' };
  }
  let key;
  try { key = fs.readFileSync(APPLE_PRIVATE_KEY_PATH, 'utf8'); }
  catch { return { ok: false, code: 500, error: 'iap backend error' }; }
  const jwt = appleJWT(env, key);
  // Production first, sandbox fallback — a sandbox receipt on production answers 404.
  const hosts = ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com'];
  let data = null;
  for (const host of hosts) {
    const r = await http(host + '/inApps/v1/transactions/' + encodeURIComponent(purchaseToken),
      { headers: { Authorization: 'Bearer ' + jwt } });
    if (r.status === 404 && host === hosts[0]) continue;
    if (!r.ok) throw new Error('app store api ' + r.status);
    data = await r.json();
    break;
  }
  if (!data) return { ok: false, code: 400, error: 'receipt not recognized' };
  // signedTransactionInfo is a JWS whose payload carries the verified transaction. Chain
  // verification against Apple's root is intentionally omitted: the response arrives over a
  // TLS-authenticated Apple endpoint, and anything malformed fails closed below.
  let tx;
  try { tx = unb64u(String(data.signedTransactionInfo || '').split('.')[1]); }
  catch { return { ok: false, code: 400, error: 'receipt not recognized' }; }
  if (tx && tx.productId === productId && !tx.revocationDate) return { ok: true };
  return { ok: false, code: 400, error: 'receipt not recognized' };
}
