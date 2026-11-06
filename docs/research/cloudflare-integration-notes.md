# Cloudflare run integration on Zihao's infra (PR #131)

Branch `feature/64-agent-on-infra` ports Eli's agent, workflow, store and
orchestrator changes onto Zihao's `feature/64-run-infra`. His tables, migration
(`0001_runs.sql`), `shared/types.ts`, agent gate, `workers/app.ts`, bindings and
`runs.server.ts` are unchanged. Our earlier duplicate infra
(`feature/64-cloudflare-run-integration`) is dropped.

## What this branch adds

- `agents/valueiq-agent.ts`: `RunView` state; `@callable` `preflight`,
  `startRun`, `cancelRun`, `answerQuestion` (typed `NOT_SUPPORTED`); user id
  from the gate header in `onConnect`; membership re-check per call;
  `runWorkflow("RUN_WORKFLOW", { runId, projectId }, { id: runId })`; workflow
  callbacks.
- `agents/calculation-run.ts`: real steps (`check-run`, `calculate`) in his file,
  class name and exports (`CalculationRun`, `CalculationRunParams`). The user is
  the run's `started_by`, read from the row, so his params shape is unchanged.
- `app/server/run-store.server.ts`: the orchestrator's `RunStore` written
  against his `runs.server.ts` functions. `run-wiring.server.ts`: orchestrator
  factory, `runStoreFor`, idempotent `startRunRecord`.
- `assistant/run`: `executeRun`, `computeFormHash`, `retry.ts`; types now
  re-export `shared/types`.
- Tests (`app/server/tests`, `assistant/tests/retry.test.ts`, access matrix agent
  checks), the `agents/vite` plugin and `@babel/plugin-proposal-decorators`.
- `GEMINI_API_KEY` in `secrets.required` for top level and development only.
  Production is NOT listed: add it before prod uses real mode.

## Where his API differed from our assumptions

1. No `listRunEvents`, no find-by-form-hash, no get-result-by-run-id: the store
   does read-only queries on his tables (`runEvents`, `runs`) and uses
   `getLatestResult` for results. Suggest adding these to `runs.server.ts`.
2. `finishRun` stores status and output together and refuses to end a run twice.
   Our orchestrator saves the result then sets the status, so the store buffers
   `saveResult` and writes it with `finishRun` on release.
3. An ended run cannot be reopened. The old flow reopened `failed` runs on a
   step retry, so the workflow sets `deferFailure`: a retryable failure keeps
   the run `running`; only the last attempt or a non-retryable error calls
   `finalizeFailed`. `onWorkflowError` is the backstop.
4. `appendRunEvent` ignores a repeated `(run, seq)` (we rejected it).
5. Failure details have no column: the error is the last `error` event, as before.
6. `shared/types.ts` has no `RunErrorCode`; `RunError.code` stays a string.
   `NOT_SUPPORTED` is not in the contract's code list yet.
7. His `createRun` has no idempotency; `startRunRecord` adds it (same form hash
   and versions returns the running or finished run).
8. His gate has no pure helper, so our `agent-gate` unit test is dropped; the
   access matrix covers the gate.

## Not tested without a key or deployment

Real Gemini calls, workflow retry/backoff on Cloudflare, and the deployed
`RUN_WORKFLOW`. Locally the matrix runs the workflow without a key and checks it
fails as `MODEL_ERROR`.

## Output integration follow-up

The output pipeline preserves these live agent/workflow APIs. Canonical publication now validates complete envelopes and pins run metadata. Non-retryable orchestrator setup errors (including a missing model key) record an error event and end the run immediately instead of entering workflow backoff. The access matrix exercises that real missing-key path without model calls. The output snapshot loader is also tested against a result published through RunOrchestrator and D1RunStore.
