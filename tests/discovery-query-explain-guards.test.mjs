import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateQueryExplainInvocation } from '../functions/scripts/discovery-query-explain-guards.mjs'

// Synthetic IDs for pure validation only; no test project has been authorized/configured.
const project = 'discovery-synthetic-test'
const args = (id = project, mode = 'explain') => [mode, '--project-id', id, '--confirm-test-project', id]
const authorization = { DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID: project }
describe('Query Explain local authorization, without Firebase initialization', () => {
  it('refuses a missing project ID instead of using a default', () => {
    assert.throws(() => validateQueryExplainInvocation(['explain'], authorization), /EXPLICIT_REAL_TEST_PROJECT_REQUIRED/)
  })
  it('refuses a project ID with no positive authorization', () => {
    assert.throws(() => validateQueryExplainInvocation(args(), {}), /MISSING_TEST_PROJECT_AUTHORIZATION/)
  })
  it('refuses any ID different from the exact positively authorized project', () => {
    assert.throws(() => validateQueryExplainInvocation(args('new-production-not-in-denylist'), authorization), /UNAUTHORIZED_TEST_PROJECT/)
  })
  it('refuses known production even if both arguments and the authorization agree', () => {
    for (const id of ['studio-9874506289-6647e', 'spotly-app-events', 'additional-production']) {
      assert.throws(() => validateQueryExplainInvocation(args(id),
        { DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID: id }, ['additional-production']), /PRODUCTION_PROJECT_FORBIDDEN/)
    }
  })
  it('accepts an exact authorization locally, without importing an SDK or executing a query', () => {
    assert.deepEqual(validateQueryExplainInvocation(args(), authorization), { mode: 'explain', projectId: project, count: 6000 })
    assert.deepEqual(validateQueryExplainInvocation([...args(project, 'seed'), '--fixture-count', '100'], authorization),
      { mode: 'seed', projectId: project, count: 100 })
  })
  it('retains confirmation, emulator, argument and fixture-count safeguards', () => {
    assert.throws(() => validateQueryExplainInvocation(['explain', '--project-id', project, '--confirm-test-project', 'other'], authorization), /CONFIRMATION_MISMATCH/)
    assert.throws(() => validateQueryExplainInvocation(args(), { ...authorization, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /REAL_TEST_FIRESTORE_REQUIRED/)
    assert.throws(() => validateQueryExplainInvocation([...args(), '--fixture-count', '100'], authorization), /FIXTURE_COUNT_IS_SEED_ONLY/)
    assert.throws(() => validateQueryExplainInvocation([...args(project, 'seed'), '--fixture-count', '99'], authorization), /INVALID_FIXTURE_COUNT/)
    assert.throws(() => validateQueryExplainInvocation([...args(), '--unexpected', 'x'], authorization), /INVALID_QUERY_EXPLAIN_ARGUMENTS/)
  })
  it('refuses unauthorized CLI invocations before any Firebase SDK import or credentials lookup', () => {
    const script = fileURLToPath(new URL('../functions/scripts/discovery-query-explain.mjs', import.meta.url))
    for (const [argv, authorized, reason] of [
      [['seed'], '', 'EXPLICIT_REAL_TEST_PROJECT_REQUIRED'],
      [args(project, 'seed'), '', 'MISSING_TEST_PROJECT_AUTHORIZATION'],
      [args(project), 'another-authorized-test', 'UNAUTHORIZED_TEST_PROJECT'],
    ]) {
      const execution = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8',
        env: { ...process.env, DISCOVERY_QUERY_EXPLAIN_TEST_PROJECT_ID: authorized } })
      assert.equal(execution.status, 1)
      assert.match(execution.stderr, new RegExp(reason))
      assert.equal(execution.stdout, '')
    }
  })
})
