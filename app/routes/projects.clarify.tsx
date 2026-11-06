import { requireProjectAccess } from "../server/access.server";
import type { Route } from "./+types/projects.clarify";

/** Step 2, Clarify (mock UI 04). Being rebuilt from the intake form fields. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  return null;
}

export default function ProjectClarify() {
  return (
    <p className="rounded-xl border p-6 text-sm text-muted-foreground">
      This step is not built yet. Enter values on the Intake step for now.
    </p>
  );
}
