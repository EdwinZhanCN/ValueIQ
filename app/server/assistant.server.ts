/**
 * The Clarify assistant (item 7), called by `ValueIQAgent.chat` after its
 * membership and run checks. One turn: check the arguments, read the project's
 * files and team defaults, work out what is still missing with the same
 * validator as the Inputs panel, then run `intakeTurn`.
 *
 * Nothing here writes the form. The draft argument is the user's own unsaved
 * form, used only as context for the reply; the conversation is not stored.
 */
import { resolveModels } from "../../assistant/models";
import { MAX_HISTORY, MAX_MESSAGE, intakeTurn } from "../../assistant/intake";
import { mapError } from "../../assistant/run/orchestrator";
import type { AssistantReply, AssistantTurn } from "../../shared/types";
import { env } from "cloudflare:workers";
import { readFormDraft, validateFormFile } from "../lib/intake-form";
import { defaultsFor } from "../lib/intake-fields";
import { pathsOf, sectionsFor } from "../components/clarify/draft";
import { evidenceCompleter } from "./evidence.server";
import { makeFileHost } from "./file-text.server";
import { listProjectFiles } from "./files.server";
import { getProjectForm } from "./projects.server";
import { NO_KEY_MESSAGE, modelSource } from "./run-wiring.server";
import { offeredDefaults, teamOfProject } from "./team-settings.server";

export type AssistantResult =
  | { ok: true; value: AssistantReply }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

const MAX_TURN_TEXT = 4000;

/** Whether the panel can talk to a model here, and why not. */
export function assistantAvailability(): {
  available: boolean;
  scripted: boolean;
  reason: string | null;
} {
  const source = modelSource();
  return {
    available: source.kind !== "none",
    scripted: source.kind === "dry",
    reason: source.kind === "none" ? NO_KEY_MESSAGE : null,
  };
}

const bad = (message: string): AssistantResult => ({
  ok: false,
  error: { code: "BAD_INPUT", message, retryable: false },
});

function parseHistory(raw: unknown): AssistantTurn[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
  const out: AssistantTurn[] = [];
  for (const t of raw as unknown[]) {
    const turn = t as { role?: unknown; text?: unknown } | null;
    if (
      !turn ||
      (turn.role !== "user" && turn.role !== "assistant") ||
      typeof turn.text !== "string" ||
      turn.text.length > MAX_TURN_TEXT
    )
      return null;
    out.push({ role: turn.role, text: turn.text });
  }
  return out;
}

export async function assistantChat(
  scope: { projectId: string; userId: string },
  args: {
    message: unknown;
    history: unknown;
    draft: unknown;
    prep?: boolean;
  },
): Promise<AssistantResult> {
  if (typeof args.message !== "string" || args.message.length > MAX_MESSAGE)
    return bad(`A message is text of at most ${MAX_MESSAGE} characters.`);
  const history = parseHistory(args.history);
  if (!history)
    return bad(
      `History is at most ${MAX_HISTORY} turns of user or assistant text.`,
    );
  if (args.message.trim() === "" && history.length > 0)
    return bad("Write a message.");

  const source = modelSource();
  if (source.kind === "none")
    return {
      ok: false,
      error: { code: "NO_MODEL", message: NO_KEY_MESSAGE, retryable: false },
    };

  const saved = (await getProjectForm(scope.projectId))?.formJson;
  const form = readFormDraft(
    args.draft === undefined || args.draft === null ? saved : args.draft,
  );
  const projectFiles = await listProjectFiles(scope.projectId);
  const context = {
    projectId: scope.projectId,
    files: projectFiles.map((f) => ({ id: f.id, projectId: scope.projectId })),
  };
  const missing = [
    ...new Set(validateFormFile(form, context).map((i) => i.field)),
  ];
  const offered = defaultsFor(
    await offeredDefaults(await teamOfProject(scope.projectId)),
  );
  const visible = sectionsFor(form.goals, pathsOf(form)).flatMap((s) => s.ids);
  const answered = new Set(form.inputs.map((i) => i.id));
  const defaults = visible.filter((id) => offered[id] && !answered.has(id));

  const vars = env as unknown as Record<string, string | undefined>;
  try {
    const value = await intakeTurn({
      form: form,
      prep: args.prep === true,
      history,
      message: args.message.trim(),
      missing,
      defaults,
      files: projectFiles.map((f) => ({
        id: f.id,
        name: f.name,
        description: form.file_descriptions[f.id] ?? f.description ?? "",
      })),
      host: makeFileHost(scope, evidenceCompleter(source)),
      apiKey: source.apiKey,
      model: resolveModels(vars).assistant,
      mode: source.mode,
      now: new Date().toISOString(),
      ...(source.kind === "dry" ? { fetch: source.fetch } : {}),
    });
    return { ok: true, value };
  } catch (e) {
    const error = mapError(e);
    return { ok: false, error: { ...error, code: "MODEL_ERROR" } };
  }
}
