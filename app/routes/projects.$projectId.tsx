import { redirect } from "react-router";
import { isClarifyField } from "../components/intake/intake-draft";
import { IntakeStep } from "../components/intake/intake-step";
import { requireProjectAccess } from "../server/access.server";
import { handleFormSave } from "../server/form-save.server";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.$projectId";

/**
 * Step 1, Intake (mock UI 03). Project data comes from the project layout.
 * `?input=<id>` focuses that field; numeric and setting fields live on
 * Clarify, so those links are sent there.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  const target = new URL(request.url).searchParams.get("input");
  if (target && isClarifyField(target))
    throw redirect(
      `/projects/${params.projectId}/clarify?input=${encodeURIComponent(target)}`,
    );
  return { target };
}

/** Kept for scripted clients; step pages save through `/projects/:id/form`. */
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  return handleFormSave(request, params.projectId, access.userId);
}

export default function ProjectIntake({ loaderData }: Route.ComponentProps) {
  const flow = useProjectFlow();
  return (
    <IntakeStep
      key={flow.project.id}
      projectId={flow.project.id}
      projectName={flow.project.name}
      initial={flow.form}
      savedAt={flow.savedAt}
      files={flow.files}
      target={loaderData.target}
    />
  );
}
