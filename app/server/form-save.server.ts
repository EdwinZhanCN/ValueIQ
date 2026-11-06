/**
 * The project form save, shared by the project page action and the
 * `/projects/:projectId/form` resource route. Callers authorize first with
 * `requireProjectAccess` and pass the resulting user id.
 */
import { data } from "react-router";
import { readSmallForm } from "./form-body.server";
import { listProjectFiles } from "./files.server";
import { validateIntakeDraft } from "../lib/intake-draft";
import { validateFormFile, serializeFormFile } from "../lib/intake-form";
import { saveProjectForm } from "./projects.server";

const MAX_BYTES = 256 * 1024;

export type FormSaveResult = {
  error: string | null;
  saved: boolean;
  conflict?: true;
};

export async function handleFormSave(
  request: Request,
  projectId: string,
  userId: string,
) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES * 2)
    throw new Response("Form too large", { status: 413 });
  const form = await readSmallForm(request);
  const raw = form.get("formJson");
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    return data<FormSaveResult>(
      { error: "Form file is too large.", saved: false },
      { status: 413 },
    );
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return data<FormSaveResult>(
      { error: "Enter valid JSON.", saved: false },
      { status: 400 },
    );
  }
  // Both step editors post a versioned form; legacy scripted payloads retain
  // their existing opaque-save compatibility.
  if (
    form.get("intakeEditor") === "structured" ||
    (json && typeof json === "object" && "version" in json)
  ) {
    const files = await listProjectFiles(projectId);
    const context = {
      projectId,
      files: files.map((file) => ({ id: file.id, projectId })),
    };
    const issues = validateIntakeDraft(json, context);
    if (issues.length)
      return data<FormSaveResult>(
        {
          error: issues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join(" "),
          saved: false,
        },
        { status: 400 },
      );
    if (validateFormFile(json, context).length === 0) {
      const canonical = { ...(json as Record<string, unknown>) };
      delete canonical.intake_draft_version;
      json = JSON.parse(serializeFormFile(canonical, context));
    }
  }
  // The version the editor loaded: "" means it loaded no saved form. Scripted
  // clients that omit the field overwrite unconditionally.
  const baseField = form.get("baseUpdatedAt");
  const base =
    typeof baseField !== "string"
      ? undefined
      : baseField === ""
        ? null
        : new Date(baseField);
  if (base && Number.isNaN(base.getTime()))
    return data<FormSaveResult>(
      { error: "Reload and try again.", saved: false },
      { status: 400 },
    );
  const saved = await saveProjectForm(projectId, json, userId, base);
  if (!saved.ok)
    return data<FormSaveResult>(
      {
        error:
          "Someone else saved this form after you opened it. Your edits are still here: copy them, then reload to see the latest version.",
        saved: false,
        conflict: true,
      },
      { status: 409 },
    );
  return data<FormSaveResult>({ error: null, saved: true });
}
