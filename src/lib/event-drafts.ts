import { httpsCallable } from 'firebase/functions'

import { functions } from './firebase'

export type CreateEventDraftPayload = {
  requestId: string
  name: string
  slug: string
  timezone: string
  startDate: string
  endDate: string
  city?: string
  departmentName?: string
  region?: string
  country?: string
}

export type CreateEventDraftResult = {
  eventId: string
  slug: string
  idempotent: boolean
}

export type CreateEventDraftErrorReason =
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'EVENT_CREATE_FAILED'
  | 'EVENT_CREATE_FORBIDDEN'
  | 'FREE_DRAFT_EXISTS'
  | 'INVALID_DATES'
  | 'INVALID_NAME'
  | 'INVALID_PAYLOAD'
  | 'INVALID_REQUEST_ID'
  | 'INVALID_SLUG'
  | 'INVALID_TIMEZONE'
  | 'REQUEST_ID_CONFLICT'
  | 'SLUG_TAKEN'
  | 'UNAUTHENTICATED'
  | 'USER_PROFILE_REQUIRED'

const CREATE_EVENT_DRAFT_REASONS = new Set<CreateEventDraftErrorReason>([
  'EMAIL_VERIFICATION_REQUIRED',
  'EVENT_CREATE_FAILED',
  'EVENT_CREATE_FORBIDDEN',
  'FREE_DRAFT_EXISTS',
  'INVALID_DATES',
  'INVALID_NAME',
  'INVALID_PAYLOAD',
  'INVALID_REQUEST_ID',
  'INVALID_SLUG',
  'INVALID_TIMEZONE',
  'REQUEST_ID_CONFLICT',
  'SLUG_TAKEN',
  'UNAUTHENTICATED',
  'USER_PROFILE_REQUIRED'
])

export class CreateEventDraftClientError extends Error {
  constructor(public readonly reason: CreateEventDraftErrorReason) {
    super(reason)
    this.name = 'CreateEventDraftClientError'
  }
}

function readErrorReason(error: unknown): CreateEventDraftErrorReason {
  const candidate = error as {
    code?: unknown
    message?: unknown
    details?: { reason?: unknown } | unknown
  }
  const detailsReason = candidate.details && typeof candidate.details === 'object'
    ? (candidate.details as { reason?: unknown }).reason
    : null

  if (
    typeof detailsReason === 'string' &&
    CREATE_EVENT_DRAFT_REASONS.has(detailsReason as CreateEventDraftErrorReason)
  ) {
    return detailsReason as CreateEventDraftErrorReason
  }

  if (candidate.code === 'functions/unauthenticated') return 'UNAUTHENTICATED'

  if (
    typeof candidate.message === 'string' &&
    CREATE_EVENT_DRAFT_REASONS.has(candidate.message as CreateEventDraftErrorReason)
  ) {
    return candidate.message as CreateEventDraftErrorReason
  }

  return 'EVENT_CREATE_FAILED'
}

export async function createEventDraft(
  payload: CreateEventDraftPayload
): Promise<CreateEventDraftResult> {
  const callable = httpsCallable<CreateEventDraftPayload, CreateEventDraftResult>(
    functions,
    'createEventDraft'
  )

  try {
    const sanitizedPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    ) as CreateEventDraftPayload
    const result = await callable(sanitizedPayload)
    return result.data
  } catch (error) {
    throw new CreateEventDraftClientError(readErrorReason(error))
  }
}
