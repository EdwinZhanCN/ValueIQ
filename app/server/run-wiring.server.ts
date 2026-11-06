/**
 * Builds the run orchestrator for the Cloudflare runtime: the D1 store, the
 * saved form, models from `assistant/models.ts`, and the Gemini key from the
 * Worker env. Shared by `ValueIQAgent` (preflight) and `CalculationRun`.
 *
 * Nothing here reads or logs the key; a missing key is an error, never a mock.
 */
import { env } from "cloudflare:workers";
import {
  OrchestratorError,
  RunOrchestrator,
  computeFormHash,
} from "../../assistant/run/orchestrator";
import { resolveModels, resolveThinking } from "../../assistant/models";
import type { FormFile } from "../../engine/types";
import type { RunView } from "../../shared/types";
import { D1RunStore } from "./run-store.server";
import type { RunRecord } from "../../assistant/run/types";
import { DEFAULT_CONFIG } from "../../engine/config";
import { getProjectForm } from "./projects.server";

/** The saved form must at least look like a form file; the engine validates the rest. */
export function asFormFile(json: unknown): FormFile {
  if (json && typeof json === "object" && "intake_draft_version" in json)
    throw new OrchestratorError(
      "BAD_INPUT",
      "Complete and save the intake before starting a run.",
      false,
    );
  const f = json as Partial<FormFile> | null;
  if (
    !f ||
    typeof f !== "object" ||
    !Array.isArray(f.goals) ||
    !Array.isArray(f.inputs)
  )
    throw new OrchestratorError(
      "BAD_INPUT",
      "The saved form is missing goals or inputs",
      false,
    );
  return f as FormFile;
}

export async function loadForm(projectId: string): Promise<FormFile> {
  const saved = await getProjectForm(projectId);
  if (!saved)
    throw new OrchestratorError("BAD_INPUT", "No form has been saved", false);
  return asFormFile(saved.formJson);
}

export function makeOrchestrator(o: {
  projectId: string;
  userId: string;
  store: D1RunStore;
  onView?: (v: RunView) => void;
}): RunOrchestrator {
  const vars = env as unknown as Record<string, string | undefined>;
  const apiKey = vars.GEMINI_API_KEY;
  if (!apiKey)
    throw new OrchestratorError(
      "MODEL_ERROR",
      "The AI service is not set up for this environment (no Gemini key). Ask an admin to add it.",
      false,
    );
  const thinking = resolveThinking(vars);
  return new RunOrchestrator({
    store: o.store,
    project_id: o.projectId,
    user_id: o.userId,
    getForm: () => loadForm(o.projectId),
    apiKey,
    models: resolveModels(vars),
    ...(thinking ? { thinking } : {}),
    now: () => new Date().toISOString(),
    newRunId: () => crypto.randomUUID(),
    checkAccess: async () => {
      try {
        await o.store.assertAccess();
        return true;
      } catch {
        return false;
      }
    },
    ...(o.onView ? { onView: o.onView } : {}),
  });
}

/** A store scoped to one user (or the system scope, `null`) and project. */
export function runStoreFor(caller: {
  userId: string | null;
  projectId: string;
}): D1RunStore {
  return new D1RunStore(caller);
}

/**
 * Creates the run row for the saved form, or returns the existing run for the
 * same project, form hash and versions (idempotent). A failed or cancelled run
 * does not count.
 */
export async function startRunRecord(
  caller: { userId: string; projectId: string },
  form: FormFile,
): Promise<{ run: RunRecord; created: boolean }> {
  const s = runStoreFor(caller);
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
    mode: "real",
    form_hash,
    contract_version: v.contract,
    formula_version: v.formula,
    settings_version: v.settings,
    started_by: caller.userId,
    started_at: new Date().toISOString(),
    form,
  });
  return { run, created: true };
}
