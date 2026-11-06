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
} from "../../assistant/run/orchestrator";
import { resolveModels, resolveThinking } from "../../assistant/models";
import type { FormFile } from "../../engine/types";
import type { RunView } from "../../shared/types";
import { D1RunStore } from "./run-store.server";
import { getProjectForm } from "./projects.server";

/** The saved form must at least look like a form file; the engine validates the rest. */
export function asFormFile(json: unknown): FormFile {
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

/** Loads the project's saved form. The caller has already passed the access check. */
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
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey)
    throw new OrchestratorError(
      "MODEL_ERROR",
      "The model key is not configured for this environment",
      false,
    );
  const vars = env as unknown as Record<string, string | undefined>;
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
