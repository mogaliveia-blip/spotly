import { Firestore } from 'firebase-admin/firestore';
import { isCalendarRange, isIanaTimezone } from './event-time';

const COMMERCIAL_OFFER_VERSION = 1;
const EVENT_NAME_MIN_LENGTH = 3;
const EVENT_NAME_MAX_LENGTH = 120;
const EVENT_SLUG_MIN_LENGTH = 3;
const EVENT_SLUG_MAX_LENGTH = 80;
const OPTIONAL_LOCATION_MAX_LENGTH = 80;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateEventDraftErrorCode =
  | 'EMAIL_VERIFICATION_REQUIRED'
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
  | 'USER_PROFILE_REQUIRED';

export class CreateEventDraftError extends Error {
  constructor(public readonly reason: CreateEventDraftErrorCode) {
    super(reason);
    this.name = 'CreateEventDraftError';
  }
}

export type CreateEventDraftPayload = {
  requestId: string;
  name: string;
  slug: string;
  timezone: string;
  startDay: string;
  endDay: string;
  city?: string;
  departmentName?: string;
  region?: string;
  country?: string;
};

export type CreateEventDraftIdentity = {
  uid: string;
  emailVerified: boolean;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

export type CreateEventDraftResult = {
  eventId: string;
  slug: string;
  idempotent: boolean;
};

type EventDocumentData = {
  createdBy?: unknown;
  creationRequestId?: unknown;
  slug?: unknown;
  commercial?: {
    offerCode?: unknown;
    state?: unknown;
  };
};

type UserDocumentData = {
  role?: unknown;
  displayName?: unknown;
  email?: unknown;
  photoURL?: unknown;
};

type ReservationData = {
  eventId?: unknown;
};

type ValidatedEventDraftPayload = CreateEventDraftPayload & {
  name: string;
  slug: string;
  timezone: string;
};

const ALLOWED_PAYLOAD_KEYS = new Set([
  'requestId',
  'name',
  'slug',
  'timezone',
  'startDay',
  'endDay',
  'city',
  'departmentName',
  'region',
  'country'
]);

export function normalizeEventSlug(value: unknown): string {
  return typeof value === 'string'
    ? value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    : '';
}

function requiredTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalTrimmedString(value: unknown): string | undefined {
  const normalized = requiredTrimmedString(value);
  return normalized || undefined;
}

function validateOptionalLocation(value: unknown): string | undefined {
  const normalized = optionalTrimmedString(value);
  if (normalized && normalized.length > OPTIONAL_LOCATION_MAX_LENGTH) {
    throw new CreateEventDraftError('INVALID_PAYLOAD');
  }
  return normalized;
}

export function validateCreateEventDraftPayload(value: unknown): ValidatedEventDraftPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CreateEventDraftError('INVALID_PAYLOAD');
  }

  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))) {
    throw new CreateEventDraftError('INVALID_PAYLOAD');
  }

  const requestId = requiredTrimmedString(input.requestId);
  if (!UUID_V4_PATTERN.test(requestId)) {
    throw new CreateEventDraftError('INVALID_REQUEST_ID');
  }

  const name = requiredTrimmedString(input.name);
  if (name.length < EVENT_NAME_MIN_LENGTH || name.length > EVENT_NAME_MAX_LENGTH) {
    throw new CreateEventDraftError('INVALID_NAME');
  }

  const slug = normalizeEventSlug(input.slug);
  if (slug.length < EVENT_SLUG_MIN_LENGTH || slug.length > EVENT_SLUG_MAX_LENGTH) {
    throw new CreateEventDraftError('INVALID_SLUG');
  }

  const timezone = requiredTrimmedString(input.timezone);
  if (!isIanaTimezone(timezone)) {
    throw new CreateEventDraftError('INVALID_TIMEZONE');
  }

  const startDay = requiredTrimmedString(input.startDay);
  const endDay = requiredTrimmedString(input.endDay);

  if (!isCalendarRange(startDay, endDay)) {
    throw new CreateEventDraftError('INVALID_DATES');
  }

  return {
    requestId,
    name,
    slug,
    timezone,
    startDay,
    endDay,
    city: validateOptionalLocation(input.city),
    departmentName: validateOptionalLocation(input.departmentName),
    region: validateOptionalLocation(input.region),
    country: validateOptionalLocation(input.country)
  };
}

function isActiveFreeDraftForCreator(data: EventDocumentData, uid: string): boolean {
  return data.createdBy === uid &&
    data.commercial?.offerCode === 'free_draft' &&
    data.commercial?.state === 'active';
}

function profileString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function profileNullableString(value: unknown, fallback?: string | null): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback?.trim() || null;
}

export async function createEventDraftTransaction(
  firestore: Firestore,
  identity: CreateEventDraftIdentity,
  rawPayload: unknown
): Promise<CreateEventDraftResult> {
  const payload = validateCreateEventDraftPayload(rawPayload);
  const userRef = firestore.doc(`users/${identity.uid}`);
  const eventRef = firestore.doc(`events/${payload.requestId}`);
  const slugRef = firestore.doc(`eventSlugs/${payload.slug}`);

  return firestore.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) {
      throw new CreateEventDraftError('USER_PROFILE_REQUIRED');
    }

    const userData = userSnapshot.data() as UserDocumentData;
    const globalRole = userData.role;
    if (globalRole !== 'user' && globalRole !== 'owner') {
      throw new CreateEventDraftError('EVENT_CREATE_FORBIDDEN');
    }

    // Bypass explicite pour le compte plateforme owner afin d'éviter une
    // régression opérationnelle. Les organisateurs user doivent être vérifiés.
    if (globalRole === 'user' && identity.emailVerified !== true) {
      throw new CreateEventDraftError('EMAIL_VERIFICATION_REQUIRED');
    }

    const existingEventSnapshot = await transaction.get(eventRef);
    if (existingEventSnapshot.exists) {
      const existingEvent = existingEventSnapshot.data() as EventDocumentData;
      if (
        existingEvent.createdBy === identity.uid &&
        existingEvent.creationRequestId === payload.requestId
      ) {
        return {
          eventId: eventRef.id,
          slug: typeof existingEvent.slug === 'string' ? existingEvent.slug : payload.slug,
          idempotent: true
        };
      }

      throw new CreateEventDraftError('REQUEST_ID_CONFLICT');
    }

    const slugSnapshot = await transaction.get(slugRef);
    let reservedSlugEventExists = false;
    if (slugSnapshot.exists) {
      const reservedEventId = (slugSnapshot.data() as ReservationData).eventId;
      if (typeof reservedEventId === 'string' && reservedEventId) {
        const reservedEventSnapshot = await transaction.get(firestore.doc(`events/${reservedEventId}`));
        reservedSlugEventExists = reservedEventSnapshot.exists;
      }
    }

    if (reservedSlugEventExists) {
      throw new CreateEventDraftError('SLUG_TAKEN');
    }

    const isOwner = globalRole === 'owner';
    const slotRef = firestore.doc(`freeDraftSlots/${identity.uid}`);
    if (!isOwner) {
      const slotSnapshot = await transaction.get(slotRef);
      if (slotSnapshot.exists) {
        const reservedEventId = (slotSnapshot.data() as ReservationData).eventId;
        if (typeof reservedEventId === 'string' && reservedEventId) {
          const reservedEventSnapshot = await transaction.get(firestore.doc(`events/${reservedEventId}`));
          if (
            reservedEventSnapshot.exists &&
            isActiveFreeDraftForCreator(
              reservedEventSnapshot.data() as EventDocumentData,
              identity.uid
            )
          ) {
            throw new CreateEventDraftError('FREE_DRAFT_EXISTS');
          }
        }
      }
    }

    const now = new Date();
    const eventData = {
      name: payload.name,
      slug: payload.slug,
      creationRequestId: payload.requestId,
      createdBy: identity.uid,
      adminId: identity.uid,
      status: 'draft',
      visibility: 'private',
      timezone: payload.timezone,
      timePrecision: 'date',
      startDay: payload.startDay,
      endDay: payload.endDay,
      ...(payload.city ? { city: payload.city } : {}),
      ...(payload.departmentName ? { departmentName: payload.departmentName } : {}),
      ...(payload.region ? { region: payload.region } : {}),
      ...(payload.country ? { country: payload.country } : {}),
      commercial: {
        offerCode: 'free_draft',
        offerVersion: COMMERCIAL_OFFER_VERSION,
        state: 'active',
        grantedAt: now
      },
      capabilities: {
        partnershipEnabled: false
      },
      createdAt: now,
      updatedAt: now
    };

    const displayName = profileString(userData.displayName, identity.displayName?.trim() || 'Créateur');
    const email = profileString(userData.email, identity.email?.trim() || '');
    const photoURL = profileNullableString(userData.photoURL, identity.photoURL);

    transaction.create(eventRef, eventData);
    transaction.create(firestore.doc(`events/${eventRef.id}/members/${identity.uid}`), {
      uid: identity.uid,
      role: 'admin',
      displayName,
      email,
      photoURL,
      joinedAt: now
    });
    transaction.create(firestore.doc(`events/${eventRef.id}/config/main`), {
      isLandingPageActive: true,
      reviewsEnabled: true
    });
    transaction.create(firestore.doc(`events/${eventRef.id}/config/marketing`), {
      heroEnabled: false,
      heroTitle: `Bienvenue à ${payload.name}`,
      heroSubtitle: "Découvrez l'application officielle du festival.",
      heroImageUrl: 'https://picsum.photos/seed/festival/1200/800',
      heroCtaText: '',
      heroCtaMode: 'none'
    });
    transaction.set(slugRef, {
      eventId: eventRef.id,
      reservedAt: now
    });

    if (!isOwner) {
      transaction.set(slotRef, {
        eventId: eventRef.id,
        reservedAt: now
      });
    }

    return {
      eventId: eventRef.id,
      slug: payload.slug,
      idempotent: false
    };
  });
}

export async function deleteEventDocumentAndReservations(
  firestore: Firestore,
  eventId: string,
  eventData: EventDocumentData | null | undefined
): Promise<void> {
  const eventRef = firestore.doc(`events/${eventId}`);
  const slug = typeof eventData?.slug === 'string' ? eventData.slug : '';
  const createdBy = typeof eventData?.createdBy === 'string' ? eventData.createdBy : '';
  const slugRef = slug ? firestore.doc(`eventSlugs/${slug}`) : null;
  const slotRef = createdBy ? firestore.doc(`freeDraftSlots/${createdBy}`) : null;

  await firestore.runTransaction(async (transaction) => {
    const [slugSnapshot, slotSnapshot] = await Promise.all([
      slugRef ? transaction.get(slugRef) : Promise.resolve(null),
      slotRef ? transaction.get(slotRef) : Promise.resolve(null)
    ]);

    if (
      slugRef &&
      slugSnapshot?.exists &&
      (slugSnapshot.data() as ReservationData).eventId === eventId
    ) {
      transaction.delete(slugRef);
    }

    if (
      slotRef &&
      slotSnapshot?.exists &&
      (slotSnapshot.data() as ReservationData).eventId === eventId
    ) {
      transaction.delete(slotRef);
    }

    transaction.delete(eventRef);
  });
}
