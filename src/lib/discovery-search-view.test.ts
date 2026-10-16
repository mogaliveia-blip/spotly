import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiscoverySearchResult } from './discovery-search-dto';
import {
  discoverySearchViewReducer, initialDiscoverySearchView, showingPreviousDiscoveryResults,
} from './discovery-search-view';

function response(...ids: string[]): DiscoverySearchResult {
  return {
    results: ids.map((id) => ({ id } as DiscoverySearchResult['results'][number])),
    meta: { complete: true, truncated: false, partialFailure: false, returnedCount: ids.length },
  };
}

describe('Discovery displayed search', () => {
  it('keeps markers, list and selection through a map gesture and pending bounds', () => {
    const first = response('event_1', 'event_2');
    let view = discoverySearchViewReducer(initialDiscoverySearchView, { type: 'success', result: first });
    view = discoverySearchViewReducer(view, { type: 'select', id: 'event_1' });
    view = discoverySearchViewReducer(view, { type: 'interrupt' });
    assert.equal(view.result, first);
    assert.deepEqual(view.result?.results.map((item) => item.id), ['event_1', 'event_2']);
    assert.equal(view.selectedId, 'event_1');
    assert.equal(showingPreviousDiscoveryResults(view, true), true);
    assert.equal(showingPreviousDiscoveryResults(view, false), true);
  });

  it('keeps previous results during a new temporal or area search, then replaces them on success', () => {
    const first = response('old');
    let view = discoverySearchViewReducer(initialDiscoverySearchView, { type: 'success', result: first });
    view = discoverySearchViewReducer(view, { type: 'start' });
    assert.equal(view.result, first);
    assert.equal(showingPreviousDiscoveryResults(view, false), true);
    const next = response('new');
    view = discoverySearchViewReducer(view, { type: 'success', result: next });
    assert.equal(view.result, next);
    assert.equal(showingPreviousDiscoveryResults(view, false), false);
    view = discoverySearchViewReducer(view, { type: 'start' });
    view = discoverySearchViewReducer(view, { type: 'success', result: response() });
    assert.deepEqual(view.result?.results, []);
    assert.equal(view.status, 'success');
  });

  it('keeps previous results and selection after a failed search', () => {
    const first = response('event_1');
    let view = discoverySearchViewReducer(initialDiscoverySearchView, { type: 'success', result: first });
    view = discoverySearchViewReducer(view, { type: 'select', id: 'event_1' });
    view = discoverySearchViewReducer(view, { type: 'start' });
    view = discoverySearchViewReducer(view, { type: 'failure', status: 'error', message: 'Réessayez.' });
    assert.equal(view.result, first);
    assert.equal(view.selectedId, 'event_1');
    assert.equal(view.message, 'Réessayez.');
    assert.equal(showingPreviousDiscoveryResults(view, false), true);
  });
});
