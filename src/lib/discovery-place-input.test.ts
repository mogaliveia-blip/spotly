import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiscoveryPlaceInput } from './discovery-place-input';

describe('Discovery place text and validated selection', () => {
  it('keeps a typed commune unvalidated through Enter and hides the hint on clear', () => {
    const input = new DiscoveryPlaceInput();
    input.input('Lorient');
    assert.equal(input.needsSelection, true);
    // Enter and mobile Done do not produce a selection event or coordinates.
    assert.equal(input.needsSelection, true);
    input.input('');
    assert.equal(input.needsSelection, false);
  });

  it('distinguishes a new draft from the last validated commune', () => {
    const input = new DiscoveryPlaceInput();
    input.input('Lorient');
    const first = input.beginSelection('Lorient, France');
    assert.equal(input.validate(first, 'Lorient, France'), true);
    assert.equal(input.needsSelection, false);
    input.input('Vannes');
    assert.equal(input.needsSelection, true);
    input.input('Lorient, France');
    assert.equal(input.needsSelection, false);
  });

  it('rejects a Google response after the visitor types, clears, or selects another place', () => {
    const input = new DiscoveryPlaceInput();
    input.input('Lorient');
    const first = input.beginSelection('Lorient, France');
    input.input('Vannes');
    assert.equal(input.validate(first, 'Lorient, France'), false);
    const second = input.beginSelection('Vannes, France');
    const third = input.beginSelection('Rennes, France');
    assert.equal(input.validate(second, 'Vannes, France'), false);
    input.input('');
    assert.equal(input.validate(third, 'Rennes, France'), false);
  });

  it('keeps the new text unvalidated after a Google error', () => {
    const input = new DiscoveryPlaceInput();
    input.input('Lorient');
    const selected = input.beginSelection('Lorient, France');
    input.invalidate();
    assert.equal(input.validate(selected, 'Lorient, France'), false);
    assert.equal(input.needsSelection, true);
  });
});
