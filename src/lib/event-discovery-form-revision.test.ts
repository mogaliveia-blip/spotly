import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  discoveryFormRevisionReducer, initialDiscoveryFormRevision, isDiscoveryFormDirty,
} from './event-discovery-form-revision'
import type { EventDiscoverySettingsPatch } from './event-discovery'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse })
  return { promise, resolve, reject }
}

const positionA = { lat: 48, lng: 2 }
const positionB = { lat: 49, lng: 3 }

// Controlled server and Places promises exercise completion ordering without
// introducing a DOM, Firebase connection or a Google Maps test runtime.
function form() {
  let draft: EventDiscoverySettingsPatch = {
    discoveryPosition: positionA, typeId: 'festival', categoryId: 'music', tags: ['family'],
  }
  let revision = discoveryFormRevisionReducer(initialDiscoveryFormRevision, { type: 'change' })
  let submitted: EventDiscoverySettingsPatch | undefined
  let server: EventDiscoverySettingsPatch | undefined

  function change(patch: EventDiscoverySettingsPatch) {
    draft = { ...draft, ...patch }
    revision = discoveryFormRevisionReducer(revision, { type: 'change' })
  }

  async function save(completion: Promise<void>) {
    const sentRevision = revision.revision
    const payload = structuredClone(draft)
    submitted = payload
    await completion
    server = payload
    revision = discoveryFormRevisionReducer(revision, { type: 'saved', revision: sentRevision })
  }

  return {
    change, save,
    get draft() { return draft },
    get submitted() { return submitted },
    get server() { return server },
    get dirty() { return isDiscoveryFormDirty(revision) },
  }
}

describe('Discovery form asynchronous save revisions', () => {
  it('marks A saved when no edit arrives before success', async () => {
    const editor = form()
    const request = deferred<void>()
    const saving = editor.save(request.promise)
    assert.equal(editor.dirty, true)
    request.resolve()
    await saving
    assert.deepEqual(editor.server, editor.draft)
    assert.deepEqual(editor.draft.discoveryPosition, positionA)
    assert.equal(editor.dirty, false)
  })

  for (const [field, change] of Object.entries({
    discoveryPosition: { discoveryPosition: positionB },
    typeId: { typeId: 'concert' },
    categoryId: { categoryId: 'culture' },
    tags: { tags: ['free'] },
  }) as [string, EventDiscoverySettingsPatch][]) {
    it(`preserves a newer ${field} edit and dirty state when save(A) succeeds`, async () => {
      const editor = form()
      const request = deferred<void>()
      const saving = editor.save(request.promise)
      const sent = structuredClone(editor.submitted)
      editor.change(change)
      const newer = structuredClone(editor.draft)
      request.resolve()
      await saving
      assert.deepEqual(editor.server, sent)
      assert.deepEqual(editor.draft, newer)
      assert.notDeepEqual(editor.server, editor.draft)
      assert.equal(editor.dirty, true)
      await editor.save(Promise.resolve())
      assert.deepEqual(editor.server, newer)
      assert.equal(editor.dirty, false)
    })
  }

  it('accepts a Places result launched before save, arriving before save(A) succeeds', async () => {
    const editor = form()
    const places = deferred<typeof positionB>()
    const searching = places.promise.then((position) => editor.change({ discoveryPosition: position }))
    const request = deferred<void>()
    const saving = editor.save(request.promise)
    places.resolve(positionB)
    await searching
    request.resolve()
    await saving
    assert.deepEqual(editor.server?.discoveryPosition, positionA)
    assert.deepEqual(editor.draft.discoveryPosition, positionB)
    assert.equal(editor.dirty, true)
  })

  it('preserves B and dirty state on save(A) failure without restoring A', async () => {
    const editor = form()
    const request = deferred<void>()
    const saving = editor.save(request.promise)
    editor.change({ discoveryPosition: positionB })
    const failed = assert.rejects(saving, /Save failed/)
    request.reject(new Error('Save failed'))
    await failed
    assert.equal(editor.server, undefined)
    assert.deepEqual(editor.draft.discoveryPosition, positionB)
    assert.equal(editor.dirty, true)
  })

  it('keeps the unchanged draft dirty on failure, and treats post-success Places as a new edit', async () => {
    const editor = form()
    await assert.rejects(editor.save(Promise.reject(new Error('Save failed'))), /Save failed/)
    assert.equal(editor.dirty, true)
    await editor.save(Promise.resolve())
    editor.change({ discoveryPosition: positionB })
    assert.deepEqual(editor.server?.discoveryPosition, positionA)
    assert.deepEqual(editor.draft.discoveryPosition, positionB)
    assert.equal(editor.dirty, true)
  })

  it('does not let an old completion undo a newer save or authoritative Event reset', () => {
    let state = discoveryFormRevisionReducer(initialDiscoveryFormRevision, { type: 'change' })
    const oldRevision = state.revision
    state = discoveryFormRevisionReducer(state, { type: 'change' })
    state = discoveryFormRevisionReducer(state, { type: 'saved', revision: state.revision })
    state = discoveryFormRevisionReducer(state, { type: 'saved', revision: oldRevision })
    assert.equal(isDiscoveryFormDirty(state), false)
    state = discoveryFormRevisionReducer(state, { type: 'reset' })
    state = discoveryFormRevisionReducer(state, { type: 'saved', revision: oldRevision })
    assert.equal(isDiscoveryFormDirty(state), false)
    state = discoveryFormRevisionReducer(state, { type: 'change' })
    state = discoveryFormRevisionReducer(state, { type: 'saved', revision: oldRevision })
    assert.equal(isDiscoveryFormDirty(state), true)
  })
})
