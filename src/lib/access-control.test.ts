import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canAccessMyEvents, canAccessPlatformAdmin } from './access-control'

describe('access-control', () => {
  it('allows platform owners to access admin and my events', () => {
    assert.equal(canAccessPlatformAdmin('owner'), true)
    assert.equal(canAccessMyEvents({ globalRole: 'owner' }), true)
  })

  it('allows event admins and editors to access my events', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'admin' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'editor' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', hasEventMembership: true }), true)
  })

  it('allows approved users without event membership to access my events', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user', isApproved: true }), true)
  })

  it('denies simple users without approval or event membership', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user' }), false)
  })

  it('denies visitors', () => {
    assert.equal(canAccessPlatformAdmin(null), false)
    assert.equal(canAccessMyEvents({ globalRole: null }), false)
  })
})
