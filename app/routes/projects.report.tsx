import { requireProjectAccess } from "../server/access.server";
import type { Route } from "./+types/projects.report";

/** Step 5, Report (mock UI 07). */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  return null;
}

export default function ProjectReport() {
  return (
    <p className="rounded-xl border p-6 text-sm text-muted-foreground">
      This step is not built yet. Download the PDF from the Review step.
    </p>
  );
}
