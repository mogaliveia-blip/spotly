import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Timestamp } from 'firebase-admin/firestore'
import { buildEventDiscoveryProjection } from '../../functions/src/event-discovery-projection'

function complete(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Festival public', slug: 'festival-public', status: 'published', visibility: 'public',
    discoveryPosition: { lat: 48.85, lng: 2.35 }, typeId: 'festival', categoryId: 'culture',
    timePrecision: 'date', startDay: '2026-09-12', endDay: '2026-09-20', timezone: 'Europe/Paris',
    commercial: { offerCode: 'public', state: 'active' }, updatedAt: Timestamp.fromMillis(1000),
    ...overrides,
  }
}
const build = (changes: Record<string, unknown> = {}) => buildEventDiscoveryProjection('source-event', complete(changes))

describe('Event public eligibility and allowlist', () => {
  it('produces the complete minimal projection with no tags, image, description or Points required', () => {
    const result = build()!
    assert.equal(result.contentType, 'event')
    assert.equal(result.sourceId, 'source-event')
    assert.equal(result.title, 'Festival public')
    assert.equal(result.slug, 'festival-public')
    assert.deepEqual(result.position, { lat: 48.85, lng: 2.35 })
    assert.equal(result.typeId, 'festival')
    assert.equal(result.categoryId, 'culture')
    assert.equal(result.timePrecision, 'date')
    assert.equal(result.timezone, 'Europe/Paris')
    assert.equal(result.updatedAt.toMillis(), 1000)
    assert.equal('tags' in result, false)
    assert.equal('thumbnail' in result, false)
  })

  for (const [label, changes] of Object.entries({
    draft: { status: 'draft' }, paused: { status: 'paused' }, private: { visibility: 'private' },
    positionMissing: { discoveryPosition: undefined }, positionInvalid: { discoveryPosition: { lat: NaN, lng: 0 } },
    typeMissing: { typeId: undefined }, categoryMissing: { categoryId: undefined },
    typeUnknown: { typeId: 'unknown' }, categoryUnknown: { categoryId: 'stage' }, tagUnknown: { tags: ['unknown'] },
    legacyTime: { timePrecision: undefined }, invalidTime: { endDay: '2026-09-01' },
    invalidTimezone: { timezone: 'invalid/zone' }, competingTime: { startDate: 'not-an-instant' },
    invalidName: { name: '  ' }, invalidSlug: { slug: 'Invalid Slug' },
    noCommercial: { commercial: undefined }, freeDraft: { commercial: { offerCode: 'free_draft', state: 'active' } },
    privateOffer: { commercial: { offerCode: 'private', state: 'active' } },
    revoked: { commercial: { offerCode: 'public', state: 'revoked' } },
    unknownOffer: { commercial: { offerCode: 'invented', state: 'active' } },
    deleting: { deletionRequestedAt: Timestamp.fromMillis(1000) },
  })) {
    it(`does not project ${label}`, () => assert.equal(build(changes), null))
  }

  it('projects past Events without consulting the current time', () => {
    assert.ok(build({ startDay: '2000-01-01', endDay: '2000-01-02' }))
  })

  it('never leaks private or unexpected fields; tags and image are copied explicitly', () => {
    const result = build({
      adminId: 'secret', createdBy: 'secret', email: 'secret', privateAccess: { secret: true },
      privateLinks: ['secret'], tokens: 'secret', capabilities: { partnershipEnabled: true },
      config: 'secret', pois: ['secret'], reviews: ['secret'], galleries: ['secret'], stripe: 'secret',
      tags: ['free', 'family', 'family'], eventCoverUrl: 'https://example.test/cover.jpg',
    })!
    assert.deepEqual(Object.keys(result).sort(), [
      'contentType', 'sourceId', 'title', 'slug', 'position', 'typeId', 'categoryId', 'tags',
      'timePrecision', 'timezone', 'windowStartAt', 'windowEndAt', 'thumbnail', 'updatedAt',
    ].sort())
    assert.deepEqual(result.tags, ['family', 'free'])
    assert.equal(result.thumbnail, 'https://example.test/cover.jpg')
  })
})

describe('Discovery query windows', () => {
  for (const [timezone, startDay, endDay, start, end] of [
    ['Europe/Paris', '2026-03-28', '2026-03-30', '2026-03-27T23:00:00.000Z', '2026-03-30T21:59:59.999Z'],
    ['Europe/Paris', '2026-03-29', '2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T21:59:59.999Z'],
    ['Europe/Paris', '2026-10-25', '2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T22:59:59.999Z'],
    ['America/New_York', '2026-03-07', '2026-03-09', '2026-03-07T05:00:00.000Z', '2026-03-10T03:59:59.999Z'],
    ['America/New_York', '2026-11-01', '2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
    ['Asia/Kathmandu', '2026-09-12', '2026-09-12', '2026-09-11T18:15:00.000Z', '2026-09-12T18:14:59.999Z'],
    ['America/St_Johns', '2006-10-29', '2006-10-29', '2006-10-29T02:30:00.000Z', '2006-10-30T03:29:59.999Z'],
    ['America/St_Johns', '2006-10-28', '2006-10-28', '2006-10-28T02:30:00.000Z', '2006-10-29T03:29:59.999Z'],
    ['Pacific/Kwajalein', '1969-09-30', '1969-09-30', '1969-09-29T13:00:00.000Z', '1969-10-01T11:59:59.999Z'],
    ['Africa/Monrovia', '1972-01-07', '1972-01-07', '1972-01-07T00:44:30.000Z', '1972-01-07T23:59:59.999Z'],
  ]) {
    it(`derives inclusive local days ${timezone} ${startDay} to ${endDay}`, () => {
      const result = build({ timezone, startDay, endDay })!
      assert.equal(result.windowStartAt.toDate().toISOString(), start)
      // Admin Timestamp.toDate rounds sub-millisecond precision; assert the stored instant instead.
      assert.equal(result.windowEndAt.seconds, Math.floor(Date.parse(end) / 1000))
      assert.equal(result.windowEndAt.nanoseconds, 999999000)
      assert.equal(result.timePrecision, 'date')
    })
  }

  it('includes the first portion of a historical day before the clock returns to the previous day', () => {
    const result = build({ timezone: 'America/St_Johns', startDay: '2006-10-29', endDay: '2006-10-29' })!
    const firstPortion = Timestamp.fromDate(new Date('2006-10-29T02:30:30.000Z'))
    assert.ok(result.windowStartAt.toMillis() <= firstPortion.toMillis())
    assert.ok(result.windowEndAt.toMillis() >= firstPortion.toMillis())
  })

  it('does not invent a boundary for a skipped calendar day', () => {
    assert.equal(build({ timezone: 'Pacific/Apia', startDay: '2011-12-30', endDay: '2011-12-30' }), null)
  })

  it('preserves datetime instants including timestamp nanoseconds', () => {
    const startDate = new Timestamp(1793511000, 123456789)
    const endDate = new Timestamp(1793514600, 987654321)
    const result = build({ timePrecision: 'datetime', startDay: undefined, endDay: undefined,
      timezone: 'America/New_York', startDate, endDate })!
    assert.equal(result.timePrecision, 'datetime')
    assert.equal(result.windowStartAt.seconds, startDate.seconds)
    assert.equal(result.windowStartAt.nanoseconds, startDate.nanoseconds)
    assert.equal(result.windowEndAt.seconds, endDate.seconds)
    assert.equal(result.windowEndAt.nanoseconds, endDate.nanoseconds)
  })

  it('rejects reversed exact instants even within the same millisecond', () => {
    assert.equal(build({ timePrecision: 'datetime', startDay: undefined, endDay: undefined,
      startDate: new Timestamp(100, 2), endDate: new Timestamp(100, 1) }), null)
  })
})
