import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  COMMERCIAL_OFFER_VERSION,
  FREE_DRAFT_POI_LIMIT,
  canCommercialPublishPrivate,
  canCommercialPublishPublic,
  isFreeDraftCommercial,
  isPartnershipEnabled,
} from './commercial-policy'

describe('commercial-policy V1', () => {
  it('centralizes the V1 version and free draft POI limit', () => {
    assert.equal(COMMERCIAL_OFFER_VERSION, 1)
    assert.equal(FREE_DRAFT_POI_LIMIT, 20)
  })

  it('does not allow an active free draft to be published', () => {
    const commercial = { offerCode: 'free_draft', state: 'active' } as const

    assert.equal(isFreeDraftCommercial(commercial), true)
    assert.equal(canCommercialPublishPrivate(commercial), false)
    assert.equal(canCommercialPublishPublic(commercial), false)
  })

  it('allows an active private offer to publish privately only', () => {
    const commercial = { offerCode: 'private', state: 'active' } as const

    assert.equal(canCommercialPublishPrivate(commercial), true)
    assert.equal(canCommercialPublishPublic(commercial), false)
  })

  it('allows an active public offer to publish privately or publicly', () => {
    const commercial = { offerCode: 'public', state: 'active' } as const

    assert.equal(canCommercialPublishPrivate(commercial), true)
    assert.equal(canCommercialPublishPublic(commercial), true)
  })

  it('does not allow a revoked entitlement to publish', () => {
    for (const offerCode of ['free_draft', 'private', 'public'] as const) {
      const commercial = { offerCode, state: 'revoked' } as const

      assert.equal(canCommercialPublishPrivate(commercial), false)
      assert.equal(canCommercialPublishPublic(commercial), false)
    }
  })

  it('does not treat a missing commercial summary as an active entitlement', () => {
    assert.equal(isFreeDraftCommercial(undefined), false)
    assert.equal(canCommercialPublishPrivate(undefined), false)
    assert.equal(canCommercialPublishPublic(undefined), false)
  })

  it('keeps Partnership disabled unless it is explicitly true', () => {
    assert.equal(isPartnershipEnabled(undefined), false)
    assert.equal(isPartnershipEnabled({}), false)
    assert.equal(isPartnershipEnabled({ partnershipEnabled: false }), false)
    assert.equal(isPartnershipEnabled({ partnershipEnabled: true }), true)
  })
})
