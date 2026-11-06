import { data, Form } from "react-router";
import { SubmitButton } from "../components/submit-button";
import { Badge } from "../components/ui/badge";
import { Field, FieldError, FieldLabel } from "../components/ui/field";
import { Textarea } from "../components/ui/textarea";
import { formText } from "~/lib/form";
import { ProjectFiles } from "../components/files/project-files";
import { requireProjectAccess } from "../server/access.server";
import { listProjectFiles } from "../server/files.server";
import {
  getProject,
  getProjectForm,
  saveProjectForm,
} from "../server/projects.server";
import type { Route } from "./+types/projects.$projectId";

// D1 rows cap out near 1 MB; keep the form file well under that.
const MAX_FORM_BYTES = 256 * 1024;

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.project.name ?? "Project"} · ValueIQ` },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  const [project, form, files] = await Promise.all([
    getProject(params.projectId),
    getProjectForm(params.projectId),
    listProjectFiles(params.projectId),
  ]);
  if (!project) throw new Response("Not found", { status: 404 });
  return {
    project: { id: project.id, name: project.name, goals: project.goals },
    form: form
      ? {
          text: JSON.stringify(form.formJson, null, 2),
          updatedAt: form.updatedAt.toISOString(),
        }
      : null,
    files,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { userId } = await requireProjectAccess(request, params.projectId);
  const body = await request.formData();
  const raw = formText(body, "formJson");
  if (new TextEncoder().encode(raw).length > MAX_FORM_BYTES) {
    return data({ ok: false, error: "Form file is too large." }, 413);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return data({ ok: false, error: "Not valid JSON." }, 400);
  }
  await saveProjectForm(params.projectId, json, userId);
  return { ok: true, error: null };
}

export default function Project({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { project, form, files } = loaderData;
  const error = actionData?.error ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-medium">{project.name}</h1>
        {project.goals.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {project.goals.map((goal) => (
              <Badge key={goal} variant="outline">
                {goal}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* The Input team's intake form (I4) replaces this section. */}
      <section
        aria-label="Form file"
        className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
      >
        <Badge variant="secondary" className="self-start">
          Placeholder for the intake form
        </Badge>
        <Form method="post" className="flex flex-col gap-3">
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="formJson">Form file (JSON)</FieldLabel>
            <Textarea
              key={form?.updatedAt ?? "empty"}
              id="formJson"
              name="formJson"
              rows={14}
              spellCheck={false}
              className="font-mono text-xs"
              defaultValue={form?.text ?? "{}"}
              aria-invalid={error ? true : undefined}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <div className="flex items-center gap-3">
            <SubmitButton>Save</SubmitButton>
            {form ? (
              <time
                dateTime={form.updatedAt}
                className="text-xs text-muted-foreground"
              >
                Saved {form.updatedAt.slice(0, 16).replace("T", " ")} UTC
              </time>
            ) : null}
          </div>
        </Form>
      </section>

      <section aria-label="Files">
        <ProjectFiles projectId={project.id} files={files} />
      </section>
    </div>
  );
}
