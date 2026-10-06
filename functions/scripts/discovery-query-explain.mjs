/** Explicit, isolated test-project tool. It never selects a Firebase CLI default project. */
import { readFile } from 'node:fs/promises'
import { validateQueryExplainInvocation } from './discovery-query-explain-guards.mjs'
import { commitDiscoverySeedBatch } from './discovery-query-explain-seed.mjs'

async function main() {
  const configuration = JSON.parse(await readFile(new URL('../../.firebaserc', import.meta.url), 'utf8'))
  const knownProduction = ['default', 'spotly'].map((alias) => configuration.projects?.[alias]).filter(Boolean)
  const { mode, projectId, count } = validateQueryExplainInvocation(process.argv.slice(2), process.env, knownProduction)

  // Fail closed before loading the SDK, looking up ADC, or initializing Firebase.
  const { initializeApp, applicationDefault, deleteApp } = await import('firebase-admin/app')
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore')
  const { default: queryModule } = await import('../lib/discovery-search-query.js')
  const { default: searchModule } = await import('../lib/discovery-search.js')
  const { default: geoModule } = await import('../lib/discovery-geo.js')
  const { default: timeModule } = await import('../lib/discovery-time.js')
  const { default: projectionModule } = await import('../lib/event-discovery-projection.js')
  const { buildDiscoverySearchQuery } = queryModule
  const { allocateRangeBudgets, validateSearchDiscoveryRequest } = searchModule
  const { geographicQueryRanges } = geoModule
  const { discoveryCandidateWindow } = timeModule
  const { buildEventDiscoveryProjection } = projectionModule

  // Credentials should be scoped to this test project. No configuration or data is imported from production.
  const app = initializeApp({ projectId, credential: applicationDefault() }, 'discovery-query-explain-test')
  const db = getFirestore(app)
  const now = Timestamp.fromDate(new Date('2026-09-12T12:00:00Z'))
  try {
    if (mode === 'seed') {
      // Never overwrite an existing dataset; prepare an empty dedicated test database.
      if (!(await db.collection('discovery_public').limit(1).get()).empty) throw new Error('Seed requires an empty discovery_public collection in the test project')
      for (let first = 0; first < count; first += 500) {
        const fixtures = []
        for (let i = first; i < Math.min(first + 500, count); i++) {
          const id = `d1_explain_${i}`
          const center = i % 10 === 0 ? { lat: 0, lng: 179.9 } : i % 10 === 1 ? { lat: 43.18, lng: 3 } : { lat: 48.85, lng: 2.35 }
          const historical = i < count * 0.75
          const day = historical ? '2000-01-01' : '2026-09-12'
          const datetime = i % 2 === 0
          const projection = buildEventDiscoveryProjection(id, {
            name: 'Synthetic Discovery fixture', slug: `synthetic-${i}`, status: 'published', visibility: 'public',
            discoveryPosition: { lat: center.lat + ((i % 31) - 15) * 0.008, lng: center.lng + ((i % 37) - 18) * 0.003 },
            typeId: i % 3 === 0 ? 'concert' : 'festival', categoryId: i % 3 === 0 ? 'music' : 'culture', tags: ['family'],
            ...(datetime ? {
              timePrecision: 'datetime', startDate: Timestamp.fromDate(new Date(`${day}T11:00:00Z`)),
              endDate: Timestamp.fromDate(new Date(`${day}T16:00:00Z`)),
            } : { timePrecision: 'date', startDay: day, endDay: day }),
            timezone: 'Europe/Paris', commercial: { offerCode: 'public', state: 'active' }, updatedAt: now,
          })
          if (!projection) throw new Error('Invalid synthetic fixture')
          fixtures.push({ id, projection })
        }
        await commitDiscoverySeedBatch(db, fixtures)
      }
      console.log(JSON.stringify({ projectId, seeded: count, syntheticOnly: true }))
      return
    }
    const radius = { kind: 'radius', center: { lat: 48.85, lng: 2.35 } }
    const cases = [
      { label: 'radius-today', area: radius, when: { kind: 'today' } },
      { label: 'radius-category-today', area: radius, when: { kind: 'today' }, categoryId: 'music' },
      { label: 'radius-now', area: radius, when: { kind: 'now' } },
      { label: 'radius-category-now', area: radius, when: { kind: 'now' }, categoryId: 'music' },
      { label: 'bounds-date', area: { kind: 'bounds', south: 48.7, north: 49, west: 2.15, east: 2.55 }, when: { kind: 'date', day: '2026-09-12' } },
      { label: 'bounds-antimeridian', area: { kind: 'bounds', south: -0.2, north: 0.2, west: 179.7, east: -179.9 }, when: { kind: 'today' } },
    ]
    const reports = []
    for (const { label, ...raw } of cases) {
      const request = validateSearchDiscoveryRequest(raw)
      const ranges = geographicQueryRanges(request.area)
      const budgets = allocateRangeBudgets(ranges.length)
      const window = discoveryCandidateWindow(request.when, { seconds: now.seconds, nanoseconds: now.nanoseconds })
      const pages = []
      for (let i = 0; i < ranges.length; i++) {
        let consumed = 0, cursor
        while (consumed < budgets[i]) {
          const limit = Math.min(100, budgets[i] - consumed)
          const explanation = await buildDiscoverySearchQuery(db, request, ranges[i], window, limit, cursor).explain({ analyze: true })
          if (!explanation.snapshot) throw new Error('Explain analyze returned no snapshot')
          const snapshot = explanation.snapshot
          consumed += snapshot.size
          // Retain raw metrics too: debug statistic names are not a stable API contract.
          pages.push({ range: ranges[i], limit, documentsReturned: snapshot.size, metrics: explanation.metrics })
          if (snapshot.size < limit) break
          cursor = snapshot.docs.at(-1)
        }
      }
      reports.push({ label, candidateDocumentsReturned: pages.reduce((total, page) => total + page.documentsReturned, 0), pages })
    }
    console.log(JSON.stringify({ projectId, referenceInstant: now.toDate().toISOString(), reports }, null, 2))
  } finally { await deleteApp(app) }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
