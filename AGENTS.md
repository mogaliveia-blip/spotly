# AGENTS.md — Un Instant Ici

## Purpose

This repository contains **Un Instant Ici**, a web/PWA application for discovering what there is to see, do, visit or experience around a location and at a given time.

This file defines stable project-level guidance for coding agents working in this repository.

Sprint-specific instructions always complement this file.

---

## 1. General working principles

Prefer:

- minimal, targeted changes;
- reuse of the existing architecture;
- explicit business rules;
- simple and testable implementations;
- progressive evolution instead of broad refactors;
- preservation of existing data and user work.

Do not introduce abstractions, frameworks, infrastructure, background systems or dependencies unless they solve a demonstrated need.

Do not turn a bounded task into a general cleanup of the repository.

When an existing technical debt is discovered but is outside the requested scope:

1. report it clearly;
2. explain its possible impact;
3. do not fix it unless it is required for the requested task.

---

## 2. No destructive changes without explicit instruction

Preserving user-created content is a core project rule.

Never silently delete, recreate or move:

- Events;
- Places;
- Points;
- media;
- reviews;
- memberships;
- configuration;
- commercial information.

A change of:

- category;
- type;
- status;
- visibility;
- commercial offer;
- publication state;

must not delete the underlying business content.

If a migration or structural conversion is required, preserve as much existing data as possible and explicitly report the migration impact before implementing it.

---

## 3. Git and deployment

Do not deploy unless the user explicitly asks for deployment.

Do not push unless explicitly requested by the current task.

Do not merge branches unless explicitly requested.

Do not create unrelated commits.

Before modifying code, inspect the current branch and repository state when relevant.

Preserve unrelated working-tree changes.

### Important repository exception

`public/assets/` is intentionally present as an untracked directory.

Do not:

- add it;
- remove it;
- clean it;
- modify it;
- include it in a commit.

Unless the user explicitly asks otherwise.

---

## 4. Product vocabulary

### Business structures

The V1 business structures are:

- `Event`
- `Place`

An Event is temporary or date-based and may contain multiple internal Points.

A Place is durable or permanent and must not be implemented as a fake Event.

Events remain under:

```text
/events/{eventId}
```

Places use a separate business collection:

```text
/places/{placeId}
```

Do not merge Events and Places into a shared business collection unless a future explicit architectural decision changes this rule.

---

## 5. Point / POI terminology

Internally, existing code may continue using:

```text
POI
poi
pois
```

when changing the technical vocabulary would create unnecessary migration or refactoring.

In organizer-facing UI, prefer:

```text
Point
Point sur la carte
Ajouter un point
```

Do not expose technical terminology such as `POI`, `contentType`, `entitlement`, or Firestore implementation details to normal users unless explicitly required.

---

## 6. Event structure

Keep Event content under the existing Event document and subcollections.

Existing internal Points remain under:

```text
/events/{eventId}/pois/{pointId}
```

Do not move Points when changing Event classification.

Event classification and Point classification are separate concerns.

An Event may contain:

- a structural type;
- a discovery type;
- a main discovery category;
- controlled characteristics/tags;
- internal Point categories.

Do not reuse internal Point categories as the global discovery taxonomy.

---

## 7. Discovery position

The public representative position of an Event is a business concept.

Use a dedicated field:

```text
discoveryPosition
```

with coordinates such as:

```text
lat
lng
```

Do not repurpose `defaultMapCenter` as the Event's authoritative discovery position.

`defaultMapCenter` may remain available for map framing or Event-map presentation.

Never infer the authoritative discovery position from the first Point returned by a query.

---

## 8. Publication model

Publication and visibility are independent concepts.

Current main publication states are:

```text
draft
published
paused
```

Visibility remains:

```text
private
public
```

A content item is not automatically discoverable merely because it exists.

For public discovery, eligibility must be explicitly satisfied.

In particular:

```text
published + public
```

means eligible for public discovery, subject to required discovery data and applicable business rules.

A transition such as:

```text
public -> private
published -> paused
```

must preserve the Event or Place and all associated content.

---

## 9. Public discovery projection

Global discovery must not read complete Event or Place business documents as its normal data source.

Use a dedicated lightweight public projection:

```text
/discovery_public/{projectionId}
```

Recommended identifiers:

```text
event_{eventId}
place_{placeId}
```

The projection contains only fields necessary for:

- geographic search;
- temporal search;
- classification/filtering;
- result display;
- navigation to the public content.

Do not expose through this projection:

- member data;
- admin identity data not required publicly;
- email addresses;
- private links or tokens;
- commercial details;
- internal configuration;
- full galleries;
- internal Points;
- private metadata.

---

## 10. Projection authority

`discovery_public` is a server-controlled derived state.

Clients must not construct or write public discovery projections directly.

For fields affecting discovery eligibility or public projection, prefer an authoritative server-side mutation.

When the source becomes publicly eligible:

```text
business source
+
public projection
```

must be updated coherently.

When the source becomes ineligible, for example:

```text
public -> private
published -> paused
```

preserve the business source and delete the public projection.

Prefer atomic or transactionally consistent server-side operations where required.

Do not rely on a delayed asynchronous projection update when that would create a temporary privacy or publication inconsistency.

---

## 11. Temporal model

Do not infer temporal precision from a Timestamp alone.

The V1 distinguishes:

### Calendar-date Event

```text
timePrecision: "date"
startDay: "YYYY-MM-DD"
endDay: "YYYY-MM-DD"
timezone: valid IANA timezone
```

These values represent inclusive calendar days.

### Exact-time Event

```text
timePrecision: "datetime"
startDate
endDate
timezone
```

`startDate` and `endDate` represent exact instants.

The two modes must not become competing sources of truth.

---

## 12. Meaning of “Now”

“Now” must remain strict.

An Event is compatible with “Now” only when its exact time interval is known and the current instant is inside that interval.

Do not infer “Now” from calendar dates alone.

An Event with only calendar dates may be compatible with:

- Today;
- This weekend;
- a selected date;

but not automatically with “Now”.

A Place without reliable opening hours must not be presented as “Open now”.

Recurring Place opening-hours logic is not part of the initial Discovery V1 unless explicitly requested.

---

## 13. Geography

Discovery is based primarily on:

- a search center;
- a distance/radius;
- a time period;
- optional classification filters.

Do not make administrative boundaries such as commune or department the primary discovery boundary.

User geolocation is optional.

The application must be able to work when the user refuses GPS access.

Alternative discovery entry points include:

- searching for a city or place;
- manually moving the map;
- searching again in the displayed area.

Do not load all public contents and filter them only in the browser.

Public search cost should scale primarily with relevant candidates, not with the total database size.

---

## 14. Maps

Reuse the existing Google Maps / Places integration unless an explicit requirement justifies a provider change.

Do not replace the current mapping stack without a demonstrated need.

The global Discovery Map and an Event Map have different responsibilities.

### Discovery Map

Shows one representative discovery item per Event or Place.

An Event should normally produce one discovery marker.

### Event Map

Shows the internal Points belonging to a single Event.

Do not expose every internal Event Point on the global Discovery Map.

---

## 15. Classification

Keep the following concepts independent:

```text
STRUCTURE
Event / Place

TYPE
Festival / Concert / Market / Restaurant / Artisan / ...

DISCOVERY CATEGORY
Music / Culture / Gastronomy / Sport / Nature / ...

CHARACTERISTICS / CONTROLLED TAGS
Family / Outdoor / Free / ...

INTERNAL POINT CATEGORY
Parking / Stage / Food / Entrance / ...
```

Use stable controlled identifiers.

Do not make Firestore paths depend on categories.

Changing an Event or Place category must not require moving documents or recreating Points.

Avoid uncontrolled free-form search tags in the V1 discovery engine.

---

## 16. Discovery engine and AI

The deterministic discovery engine must work without AI.

Core discovery parameters are structured data such as:

- center;
- radius;
- time window;
- category;
- controlled tags;
- publication eligibility.

AI may later interpret natural-language requests into those parameters.

AI must not become the primary database search mechanism.

Do not send the full Firestore dataset to an AI model to perform discovery.

---

## 17. Commercial architecture

Commercial logic belongs to Un Instant Ici.

Stripe is a payment rail, not the product's business-rule engine.

Do not introduce Stripe subscriptions, schedules, proration, customer portals or complex pricing infrastructure unless explicitly requested.

The Event or Place business model must not be encoded through Stripe Price IDs alone.

Commercial rights and business content remain separate.

Changing or losing a commercial entitlement must never automatically delete user-created content.

---

## 18. Point tiers

The future commercial model may use Point tiers such as:

```text
1
3
5
7
10
...
```

These are commercial capacity concepts.

Do not hardcode their pricing or meaning unless the current task explicitly defines them.

Do not assume the historical `20` Point free-draft constant is the final business rule.

Do not delete Points when an entitlement or tier changes.

---

## 19. Firebase and security

Respect the existing Firebase architecture:

- Firebase Authentication;
- Firestore;
- Storage;
- Cloud Functions;
- existing Event permissions and memberships.

Sensitive or authoritative operations should remain server-controlled when required.

Do not weaken Firestore or Storage rules merely to make an implementation easier.

Do not expose private data through a public projection and then attempt to hide it only in React.

When changing a field that affects security, publication, authority or public exposure, inspect:

- application code;
- Cloud Functions;
- Firestore rules;
- Storage rules when applicable;
- relevant tests.

---

## 20. Existing authority model

Current roles include:

Platform:

```text
user
owner
```

Event:

```text
admin
editor
```

Do not introduce a global “organizer” role unless explicitly requested.

`createdBy` is traceability information and must not implicitly become an authorization rule.

Be careful with legacy `adminId` authority.

If work affects Event membership or permissions, inspect both membership documents and legacy `adminId` behavior before changing access rules.

---

## 21. Testing

For each bounded implementation:

- run relevant TypeScript checks;
- run relevant unit tests;
- run Functions tests when Functions change;
- run Firestore Rules tests when Rules change;
- run the Next.js build when appropriate.

Do not claim a test passed unless it was actually run successfully.

If a test cannot be run, state that clearly.

Prefer focused tests for the changed business rule rather than relying only on broad existing test suites.

---

## 22. Documentation and comments

Update documentation only when the implementation makes existing documentation materially incorrect.

Do not perform broad documentation cleanup during an unrelated sprint.

Comments should explain:

- business invariants;
- unusual security constraints;
- non-obvious architectural decisions.

Avoid comments that merely restate the code.

---

## 23. Scope control

Before implementing a requested sprint:

1. identify the exact affected files and flows;
2. identify dependencies and security implications;
3. make only the changes needed for the sprint;
4. test those changes;
5. report remaining risks separately.

Do not automatically begin the next sprint.

Do not implement future roadmap items merely because the current architecture could support them.

---

## 24. Priority when instructions conflict

Use this order:

1. explicit instruction in the current user request;
2. explicit sprint specification;
3. this `AGENTS.md`;
4. existing repository conventions;
5. reasonable implementation defaults.

If a requested change appears to conflict with a major invariant in this file, report the conflict before making a destructive or security-sensitive change.
