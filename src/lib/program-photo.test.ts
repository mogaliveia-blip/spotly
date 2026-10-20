import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isOwnProgramPhotoPath, makeProgramPhotoPath, validateProgramPhotoFile } from './program-photo'

const id = '11111111-1111-4111-8111-111111111111'

describe('program photos', () => {
  it('uses a unique path scoped to the Event and prestation', () => {
    for (const [type, extension] of [
      ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
    ]) {
      const path = makeProgramPhotoPath('festival', 'artist', { type, size: 10 }, id)
      assert.equal(path, `events/festival/program/artist/photo-${id}.${extension}`)
      assert.equal(isOwnProgramPhotoPath('festival', 'artist', path), true)
      assert.equal(isOwnProgramPhotoPath('other', 'artist', path), false)
      assert.equal(isOwnProgramPhotoPath('festival', 'other', path), false)
    }
  })

  it('rejects unsupported, empty and oversized files and invalid identifiers', () => {
    for (const file of [
      { type: 'image/gif', size: 10 }, { type: 'image/jpeg', size: 0 },
      { type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 },
    ]) assert.throws(() => validateProgramPhotoFile(file), /PROGRAM_PHOTO_INVALID/)
    assert.throws(() => makeProgramPhotoPath('bad/id', 'artist', { type: 'image/png', size: 1 }, id), /PROGRAM_PHOTO_INVALID_PATH/)
    assert.throws(() => makeProgramPhotoPath('festival', 'bad/id', { type: 'image/png', size: 1 }, id), /PROGRAM_PHOTO_INVALID_PATH/)
    assert.throws(() => makeProgramPhotoPath('festival', '..', { type: 'image/png', size: 1 }, id), /PROGRAM_PHOTO_INVALID_PATH/)
    assert.throws(() => makeProgramPhotoPath('x'.repeat(500), 'artist', { type: 'image/png', size: 1 }, id), /PROGRAM_PHOTO_INVALID_PATH/)
    assert.throws(() => makeProgramPhotoPath('festival', 'artist', { type: 'image/png', size: 1 }, 'invalid'), /PROGRAM_PHOTO_INVALID_PATH/)
  })
})
