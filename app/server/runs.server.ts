/**
 * Server functions for calculation runs (integration contract section 5):
 * `createRun`, `appendRunEvent`, `finishRun`, `getRun`, `getLatestResult`.
 *
 * Each takes the calling user's id (from the access gate or the session, never
 * from a client argument) and re-checks team membership for the project before
 * touching a row. Callers never receive the D1 handle.
 */
import { env } from "cloudflare:workers";
import { computeFormHash } from "../../assistant/run/orchestrator";
import type { RunEventRow, RunRecord } from "../../assistant/run/types";
import { DEFAULT_CONFIG } from "../../engine/config";
import type { FormFile, RunOutput } from "../../engine/types";
import type { RunError, RunStatus } from "../../shared/types";
import { D1RunStore } from "./run-store.server";

export { RunAccessError } from "./run-store.server";

/** `userId: null` is the internal system scope for the agent's own callbacks. */
type Caller = { userId: string | null; projectId: string };

/** A store scoped to one user and project, for the agent and workflow adapters. */
export function runStoreFor(caller: Caller): D1RunStore {
  return new D1RunStore(env.DB, caller);
}

const store = (c: Caller) => runStoreFor(c);

/**
 * Starts a run for the saved form, or returns the existing run for the same
 * project, form hash and versions (idempotent). A failed or cancelled run does
 * not count: editing nothing and starting again makes a new run.
 */
export async function createRun(
  caller: { userId: string; projectId: string },
  form: FormFile,
  mode: "real" | "stub" = "real",
): Promise<{ run: RunRecord; created: boolean }> {
  const s = store(caller);
  const form_hash = computeFormHash(form);
  const existing = await s.findRunByFormHash(caller.projectId, form_hash);
  if (
    existing &&
    (existing.status === "running" ||
      existing.status === "released" ||
      existing.status === "gap_list")
  )
    return { run: existing, created: false };
  const v = DEFAULT_CONFIG.versions;
  const run = await s.createRun({
    id: crypto.randomUUID(),
    project_id: caller.projectId,
    mode,
    form_hash,
    contract_version: v.contract,
    formula_version: v.formula,
    settings_version: v.settings,
    started_by: caller.userId,
    started_at: new Date().toISOString(),
  });
  return { run, created: true };
}

/** The agent assigns `seq`; a duplicate (run_id, seq) is rejected. */
export function appendRunEvent(
  caller: Caller,
  event: Omit<RunEventRow, "created_at"> & { created_at?: string },
): Promise<void> {
  return store(caller).appendRunEvent({
    ...event,
    created_at: event.created_at ?? new Date().toISOString(),
  });
}

/** Ends a run as released, gap_list, failed or cancelled. */
export async function finishRun(
  caller: Caller,
  runId: string,
  status: Extract<RunStatus, "released" | "gap_list" | "failed" | "cancelled">,
  error?: RunError,
): Promise<RunRecord> {
  const s = store(caller);
  if (status === "cancelled") {
    const rec = await s.cancel(runId, new Date().toISOString());
    if (!rec) throw new Error(`no run ${runId}`);
    return rec;
  }
  const rec = await s.updateRun(runId, {
    status,
    finished_at: new Date().toISOString(),
    ...(error ? { error } : {}),
  });
  return rec;
}

export function getRun(
  caller: Caller,
  runId: string,
): Promise<RunRecord | null> {
  return store(caller).getRun(runId);
}

/** The newest released or gap-list run with its stored output. */
export function getLatestResult(
  caller: Caller,
): Promise<{ run: RunRecord; output: RunOutput } | null> {
  return store(caller).latestResult();
}
