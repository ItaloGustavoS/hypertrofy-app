import { describe, expect, it } from 'vitest'
import { PREMIUM_PRODUCT_ID, shouldShowAds, normalizePurchase, receiptPlatform, storePurchaseVerdict } from './monetization.js'

describe('PREMIUM_PRODUCT_ID', () => {
  it('is the agreed non-consumable id', () => {
    expect(PREMIUM_PRODUCT_ID).toBe('hypertrofy_premium_remove_ads')
  })
})

describe('shouldShowAds', () => {
  it('shows ads when adFree is false', () => {
    expect(shouldShowAds(false)).toBe(true)
  })
  it('hides ads when adFree is true', () => {
    expect(shouldShowAds(true)).toBe(false)
  })
  // adFree is undefined / null on legacy state — show ads by default
  it('shows ads for a missing adFree flag (legacy state)', () => {
    expect(shouldShowAds(undefined)).toBe(true)
    expect(shouldShowAds(null)).toBe(true)
  })
})

describe('normalizePurchase', () => {
  it('passes through a valid android payload', () => {
    const src = { productId: 'hypertrofy_premium_remove_ads', purchaseToken: 'a1b2c3', platform: 'android' }
    expect(normalizePurchase(src)).toEqual(src)
  })
  it('passes through a valid ios payload', () => {
    const src = { productId: 'hypertrofy_premium_remove_ads', purchaseToken: 'tx-999', platform: 'ios' }
    expect(normalizePurchase(src)).toEqual(src)
  })
  it('defaults platform to android when omitted', () => {
    const out = normalizePurchase({ productId: 'hypertrofy_premium_remove_ads', purchaseToken: 'tok' })
    expect(out.platform).toBe('android')
  })
  // Rejects that keep the server from guessing a product or token.
  it('rejects a payload missing productId', () => {
    expect(normalizePurchase({ purchaseToken: 'tok', platform: 'android' })).toBe(null)
  })
  it('rejects a payload missing purchaseToken', () => {
    expect(normalizePurchase({ productId: 'hypertrofy_premium_remove_ads', platform: 'ios' })).toBe(null)
  })
  it('rejects an unknown product id', () => {
    expect(normalizePurchase({ productId: 'something_else', purchaseToken: 'tok', platform: 'android' })).toBe(null)
  })
  it('rejects an unknown platform', () => {
    expect(normalizePurchase({ productId: 'hypertrofy_premium_remove_ads', purchaseToken: 'tok', platform: 'web' })).toBe(null)
  })
})

describe('receiptPlatform', () => {
  it('returns the platform string for valid payloads', () => {
    expect(receiptPlatform({ platform: 'android' })).toBe('android')
    expect(receiptPlatform({ platform: 'ios' })).toBe('ios')
  })
  // The validator on the server side needs a concrete string — never silently guess.
  it('returns null for anything else', () => {
    expect(receiptPlatform({})).toBe(null)
    expect(receiptPlatform({ platform: 'web' })).toBe(null)
    expect(receiptPlatform({ platform: undefined })).toBe(null)
  })
})

// The published app has no server: the resolved store transaction is the receipt.
describe('storePurchaseVerdict', () => {
  it('unlocks on an Android transaction for our product', () => {
    expect(storePurchaseVerdict({ productIdentifier: PREMIUM_PRODUCT_ID, purchaseToken: 'tok' }, 'android')).toEqual({ ok: true })
  })
  it('unlocks on a StoreKit transaction that only carries a transaction id', () => {
    expect(storePurchaseVerdict({ productIdentifier: PREMIUM_PRODUCT_ID, transactionId: '2000000123' }, 'ios')).toEqual({ ok: true })
  })
  it('refuses a transaction for another product', () => {
    expect(storePurchaseVerdict({ productIdentifier: 'something_else', purchaseToken: 'tok' }, 'android')).toEqual({ ok: false })
  })
  it('refuses a transaction with no identifier at all', () => {
    expect(storePurchaseVerdict({ productIdentifier: PREMIUM_PRODUCT_ID }, 'android')).toEqual({ ok: false })
    expect(storePurchaseVerdict(null, 'android')).toEqual({ ok: false })
  })
})
