import { requireProjectAccess } from "../server/access.server";
import { handleFormSave } from "../server/form-save.server";
import type { Route } from "./+types/projects.form";

/**
 * POST-only: saves the project form for any step page (Intake, Clarify).
 * Fields: `formJson`, and `baseUpdatedAt` for the edit-conflict check.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  return handleFormSave(request, params.projectId, access.userId);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  throw new Response("Method not allowed", { status: 405 });
}
