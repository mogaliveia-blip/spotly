import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canAccessMyEvents, canAccessPlatformAdmin, canCreateEvent } from './access-control'

describe('access-control', () => {
  it('allows platform owners to access admin and my events', () => {
    assert.equal(canAccessPlatformAdmin('owner'), true)
    assert.equal(canAccessMyEvents({ globalRole: 'owner' }), true)
    assert.equal(canCreateEvent('owner'), true)
  })

  it('allows global users, event admins and editors to access my events', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user' }), true)
    assert.equal(canCreateEvent('user'), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'admin' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'editor' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', hasEventMembership: true }), true)
  })

  it('does not grant platform administration to a global user', () => {
    assert.equal(canAccessPlatformAdmin('user'), false)
    assert.equal(canAccessMyEvents({ globalRole: 'user' }), true)
    assert.equal(canCreateEvent('user'), true)
  })

  it('keeps membership-based access compatible when no global role is available', () => {
    assert.equal(canAccessMyEvents({ globalRole: null, eventRole: 'admin' }), true)
    assert.equal(canAccessMyEvents({ globalRole: null, eventRole: 'editor' }), true)
    assert.equal(canAccessMyEvents({ globalRole: null, hasEventMembership: true }), true)
  })

  it('denies visitors', () => {
    assert.equal(canAccessPlatformAdmin(null), false)
    assert.equal(canAccessMyEvents({ globalRole: null }), false)
    assert.equal(canCreateEvent(null), false)
  })
})
