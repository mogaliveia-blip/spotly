/** Pure local authorization: importing this module never loads Firebase or credentials. */
export function validateQueryExplainInvocation(argv, environment, additionalProductionIds = []) {
  const [mode, ...argumentsList] = argv
  if (!['seed', 'explain'].includes(mode)) throw new Error('INVALID_QUERY_EXPLAIN_MODE')
  const options = {}
  for (let i = 0; i < argumentsList.length; i += 2) {
    const key = argumentsList[i]
    if (!['--project-id', '--confirm-test-project', '--fixture-count'].includes(key) ||
        !argumentsList[i + 1] || key in options) throw new Error('INVALID_QUERY_EXPLAIN_ARGUMENTS')
    options[key] = argumentsList[i + 1]
  }
  const projectId = options['--project-id']
  if (!projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) || projectId.startsWith('demo-')) {
    throw new Error('EXPLICIT_REAL_TEST_PROJECT_REQUIRED')
  }
  const authorized = environment.DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID
  if (!authorized) throw new Error('MISSING_TEST_PROJECT_AUTHORIZATION')
  if (projectId !== authorized) throw new Error('UNAUTHORIZED_TEST_PROJECT')
  if (projectId !== options['--confirm-test-project']) throw new Error('TEST_PROJECT_CONFIRMATION_MISMATCH')
  const production = new Set(['studio-9874506289-6647e', 'spotly-app-events', ...additionalProductionIds])
  if (production.has(projectId)) throw new Error('PRODUCTION_PROJECT_FORBIDDEN')
  if (environment.FIRESTORE_EMULATOR_HOST) throw new Error('REAL_TEST_FIRESTORE_REQUIRED')
  if (mode === 'explain' && options['--fixture-count']) throw new Error('FIXTURE_COUNT_IS_SEED_ONLY')
  const count = Number(options['--fixture-count'] ?? 6000)
  if (!Number.isInteger(count) || count < 100 || count > 20_000) throw new Error('INVALID_FIXTURE_COUNT')
  return { mode, projectId, count }
}
