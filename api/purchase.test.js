import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PREMIUM_PRODUCT_ID, normalizePayload, validatePurchase, _resetPlayCache } from './purchase.js';

const PID = PREMIUM_PRODUCT_ID;
const goodAndroid = { productId: PID, purchaseToken: 'tok-1', platform: 'android' };
const goodApple = { productId: PID, purchaseToken: 'jws-1', platform: 'ios' };

// A minimal fetch stub: route on URL, record calls.
function stub(routes) {
  const calls = [];
  const http = async (url, opts) => {
    calls.push({ url, opts });
    for (const [match, res] of routes) {
      if (url.includes(match)) return { ok: res.status < 400, status: res.status, json: async () => res.body };
    }
    throw new Error('unexpected url ' + url);
  };
  http.calls = calls;
  return http;
}

const ok = body => ({ status: 200, body });

/* ---------- normalizePayload ---------- */

test('normalizePayload accepts a well-formed payload', () => {
  const out = normalizePayload(goodAndroid);
  assert.equal(out.ok, true);
  assert.equal(out.platform, 'android');
});

test('normalizePayload rejects a missing or malformed payload without guessing', () => {
  assert.equal(normalizePayload(null).ok, false);
  assert.equal(normalizePayload('x').ok, false);
  // unknown product: never validate a product the server does not know
  assert.equal(normalizePayload({ ...goodAndroid, productId: 'other' }).code, 400);
  // empty token
  assert.equal(normalizePayload({ ...goodAndroid, purchaseToken: '' }).code, 400);
  // no platform defaulting on the server side — the client assumes android, the server does not
  assert.equal(normalizePayload({ productId: PID, purchaseToken: 't' }).code, 400);
  assert.equal(normalizePayload({ ...goodAndroid, platform: 'web' }).code, 400);
});

/* ---------- unconfigured vendors fail closed with 501 ---------- */

test('android without env configured answers 501 iap-not-configured', async () => {
  const out = await validatePurchase(goodAndroid, {}, stub([]));
  assert.equal(out.code, 501);
  assert.equal(out.error, 'iap-not-configured');
  assert.equal(out.ok, false);
});

test('ios without env configured answers 501 iap-not-configured', async () => {
  const out = await validatePurchase(goodApple, {}, stub([]));
  assert.equal(out.code, 501);
  assert.equal(out.error, 'iap-not-configured');
});

/* ---------- Google Play ---------- */

function writeSA() {
  // A throwaway RSA key — the OAuth handshake is stubbed, the file only needs the fields.
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-')), 'sa.json');
  fs.writeFileSync(f, JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  return f;
}

test('android purchaseState 0 validates, others fail closed', async () => {
  _resetPlayCache();
  const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: writeSA(), GOOGLE_PLAY_PACKAGE_NAME: 'app.test' };

  const purchased = stub([
    ['oauth2.googleapis.com/token', ok({ access_token: 'at', expires_in: 3600 })],
    ['androidpublisher.googleapis.com', ok({ purchaseState: 0 })],
  ]);
  assert.deepEqual(await validatePurchase(goodAndroid, env, purchased), { ok: true });

  _resetPlayCache();
  const cancelled = stub([
    ['oauth2.googleapis.com/token', ok({ access_token: 'at', expires_in: 3600 })],
    ['androidpublisher.googleapis.com', ok({ purchaseState: 1 })],
  ]);
  const out = await validatePurchase(goodAndroid, env, cancelled);
  assert.equal(out.ok, false);
  assert.equal(out.code, 400);
});

test('android 404 from Play fails closed as unrecognized receipt', async () => {
  _resetPlayCache();
  const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: writeSA(), GOOGLE_PLAY_PACKAGE_NAME: 'app.test' };
  const http = stub([
    ['oauth2.googleapis.com/token', ok({ access_token: 'at', expires_in: 3600 })],
    ['androidpublisher.googleapis.com', { status: 404, body: {} }],
  ]);
  const out = await validatePurchase(goodAndroid, env, http);
  assert.equal(out.ok, false);
  assert.equal(out.code, 400);
});

test('android vendor outage fails closed with 500, not ok', async () => {
  _resetPlayCache();
  const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: writeSA(), GOOGLE_PLAY_PACKAGE_NAME: 'app.test' };
  const http = stub([
    ['oauth2.googleapis.com/token', ok({ access_token: 'at', expires_in: 3600 })],
    ['androidpublisher.googleapis.com', { status: 503, body: {} }],
  ]);
  const out = await validatePurchase(goodAndroid, env, http);
  assert.equal(out.ok, false);
  assert.equal(out.code, 500);
});

/* ---------- App Store ---------- */

function writeP8() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p8-')), 'k.p8');
  fs.writeFileSync(f, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return f;
}
const appleEnv = () => ({
  APPLE_ISSUER_ID: 'iss', APPLE_KEY_ID: 'kid',
  APPLE_PRIVATE_KEY_PATH: writeP8(), APPLE_BUNDLE_ID: 'app.test'
});
const jws = payload => {
  const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b64u({ alg: 'ES256' }) + '.' + b64u(payload) + '.sig';
};

test('ios validates the matching non-revoked transaction', async () => {
  const http = stub([['api.storekit', ok({ signedTransactionInfo: jws({ productId: PID }) })]]);
  assert.deepEqual(await validatePurchase(goodApple, appleEnv(), http), { ok: true });
});

test('ios sandbox receipt validates after the production 404', async () => {
  const http = async url => url.includes('storekit-sandbox')
    ? { ok: true, status: 200, json: async () => ({ signedTransactionInfo: jws({ productId: PID }) }) }
    : { ok: false, status: 404, json: async () => ({}) };
  assert.deepEqual(await validatePurchase(goodApple, appleEnv(), http), { ok: true });
});

test('ios revoked or mismatched transactions fail closed', async () => {
  const revoked = stub([['api.storekit', ok({ signedTransactionInfo: jws({ productId: PID, revocationDate: 123 }) })]]);
  assert.equal((await validatePurchase(goodApple, appleEnv(), revoked)).ok, false);
  const other = stub([['api.storekit', ok({ signedTransactionInfo: jws({ productId: 'other' }) })]]);
  assert.equal((await validatePurchase(goodApple, appleEnv(), other)).ok, false);
});
