/**
 * Builds the run orchestrator for the Cloudflare runtime: the D1 store, the
 * saved form, models from `assistant/models.ts`, and the Gemini key from the
 * Worker env. Shared by `ValueIQAgent` (preflight) and `CalculationRun`.
 *
 * Nothing here reads or logs the key; a missing key is an error, never a mock.
 * The one exception is explicit and local only: `VALUEIQ_MODEL=dry` in
 * `.dev.vars` swaps Gemini for the scripted model in `assistant/dry-fetch.ts`
 * and marks every run `stub`, so the UI and PDF carry the STUB label. The
 * deployed environments never set it (`scripts/check-deploy-target.test.mjs`).
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
import type { EngineConfig } from "../../engine/types";
import {
  engineConfigFor,
  getTeamSettings,
  runSettings,
  teamOfProject,
  valuesOf,
} from "./team-settings.server";
import { getProjectForm } from "./projects.server";
import { dryFetch } from "../../assistant/dry-fetch";
import type { FetchLike } from "../../assistant/gemini";
import { getExtractedText } from "./file-text.server";

/** Where model calls go: Gemini with the Worker key, or the local scripted model. */
export type ModelSource =
  | { kind: "live"; apiKey: string; mode: "real" }
  | { kind: "dry"; apiKey: string; mode: "stub"; fetch: FetchLike }
  | { kind: "none"; mode: "real" };

export function modelSource(
  vars: Record<string, string | undefined> = env as unknown as Record<
    string,
    string | undefined
  >,
): ModelSource {
  if (vars.VALUEIQ_MODEL === "dry")
    return {
      kind: "dry",
      // Never sent anywhere: the scripted fetch answers every request.
      apiKey: "scripted-model-no-key",
      mode: "stub",
      // A short pause per answer so local progress and "Processing" are visible.
      fetch: dryFetch({ delayMs: 400 }),
    };
  const apiKey = vars.GEMINI_API_KEY;
  return apiKey
    ? { kind: "live", apiKey, mode: "real" }
    : { kind: "none", mode: "real" };
}

export const NO_KEY_MESSAGE =
  "The AI service is not set up for this environment (no Gemini key). Ask an admin to add it.";

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

export async function loadForm(projectId: string): Promise<FormFile> {
  const saved = await getProjectForm(projectId);
  if (!saved)
    throw new OrchestratorError("BAD_INPUT", "No form has been saved", false);
  return asFormFile(saved.formJson);
}

/**
 * The engine configuration a run uses: the team settings in effect when the
 * run started. The version must equal the one recorded on the run row; a
 * mismatch means the settings changed in the instant the run started.
 */
export async function runEngineConfig(
  store: D1RunStore,
  projectId: string,
  runId: string,
): Promise<Partial<EngineConfig>> {
  const run = await store.getRun(runId);
  if (!run) throw new OrchestratorError("BAD_INPUT", "No such run", false);
  const teamId = await teamOfProject(projectId);
  const { settings, version } = await runSettings(
    teamId,
    new Date(run.started_at),
  );
  if (version !== run.settings_version)
    throw new OrchestratorError(
      "BAD_INPUT",
      "The team's financial defaults changed as this run started. Start it again.",
      false,
    );
  return engineConfigFor(valuesOf(settings));
}

/** The engine configuration for the team's settings right now (pre-flight). */
export async function currentEngineConfig(
  projectId: string,
): Promise<Partial<EngineConfig>> {
  const settings = await getTeamSettings(await teamOfProject(projectId));
  return engineConfigFor(valuesOf(settings));
}

export function makeOrchestrator(o: {
  projectId: string;
  userId: string;
  store: D1RunStore;
  onView?: (v: RunView) => void;
  /** Team settings for the engine (cost uplift, settings version). */
  config?: Partial<EngineConfig>;
}): RunOrchestrator {
  const vars = env as unknown as Record<string, string | undefined>;
  const source = modelSource(vars);
  if (source.kind === "none")
    throw new OrchestratorError("MODEL_ERROR", NO_KEY_MESSAGE, false);
  const thinking = resolveThinking(vars);
  return new RunOrchestrator({
    store: o.store,
    project_id: o.projectId,
    user_id: o.userId,
    getForm: () => loadForm(o.projectId),
    apiKey: source.apiKey,
    mode: source.mode,
    ...(source.kind === "dry" ? { fetch: source.fetch } : {}),
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
    ...(o.config ? { config: o.config } : {}),
    // Reads the run's cited files for the quote check (no model involved).
    files: {
      extractedText: async (fileId) => {
        const r = await getExtractedText(
          { projectId: o.projectId, userId: o.userId },
          fileId,
        );
        return r.ok ? { ok: true, text: r.text, name: r.name } : r;
      },
    },
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
  opts: { forceNew?: boolean } = {},
): Promise<{ run: RunRecord; created: boolean }> {
  const s = runStoreFor(caller);
  // The team settings in effect now decide the run's settings version, and
  // the version is part of the idempotency key: after a settings change the
  // same form gets a new run instead of the old result.
  const { version } = await runSettings(
    await teamOfProject(caller.projectId),
    new Date(),
  );
  const form_hash = computeFormHash(form, version);
  const existing = opts.forceNew
    ? null
    : await s.findRunByFormHash(caller.projectId, form_hash);
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
    mode: modelSource().mode,
    form_hash,
    contract_version: v.contract,
    formula_version: v.formula,
    settings_version: version,
    started_by: caller.userId,
    started_at: new Date().toISOString(),
    form,
  });
  return { run, created: true };
}
