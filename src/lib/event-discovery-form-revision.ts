export interface DiscoveryFormRevision {
  revision: number
  savedRevision: number
}

export type DiscoveryFormRevisionAction =
  | { type: 'change' }
  | { type: 'reset' }
  | { type: 'saved'; revision: number }

export const initialDiscoveryFormRevision: DiscoveryFormRevision = {
  revision: 0, savedRevision: 0,
}

export function discoveryFormRevisionReducer(
  state: DiscoveryFormRevision, action: DiscoveryFormRevisionAction
): DiscoveryFormRevision {
  switch (action.type) {
    case 'change':
      return { ...state, revision: state.revision + 1 }
    case 'reset':
      return { revision: state.revision + 1, savedRevision: state.revision + 1 }
    case 'saved':
      // A completion acknowledges its snapshot, never newer edits. A stale
      // completion cannot undo a newer acknowledgment or an Event prop reset.
      return { ...state, savedRevision: Math.max(state.savedRevision, action.revision) }
  }
}

export function isDiscoveryFormDirty(state: DiscoveryFormRevision): boolean {
  return state.revision !== state.savedRevision
}
