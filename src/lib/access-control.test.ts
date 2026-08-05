import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canAccessMyEvents, canAccessPlatformAdmin, canCreateEvent } from './access-control'

describe('access-control', () => {
  it('allows platform owners to access admin and my events', () => {
    assert.equal(canAccessPlatformAdmin('owner'), true)
    assert.equal(canAccessMyEvents({ globalRole: 'owner' }), true)
    assert.equal(canCreateEvent('owner'), true)
  })

  it('allows event admins and editors to access my events', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'admin' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', eventRole: 'editor' }), true)
    assert.equal(canAccessMyEvents({ globalRole: 'user', hasEventMembership: true }), true)
  })

  it('does not treat account approval as an event management permission', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user' }), false)
    assert.equal(canCreateEvent('user'), false)
  })

  it('denies simple users without approval or event membership', () => {
    assert.equal(canAccessMyEvents({ globalRole: 'user' }), false)
  })

  it('denies visitors', () => {
    assert.equal(canAccessPlatformAdmin(null), false)
    assert.equal(canAccessMyEvents({ globalRole: null }), false)
  })
})
