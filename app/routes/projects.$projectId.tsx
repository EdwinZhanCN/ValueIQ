import { ProjectFiles } from "../components/files/project-files";
import { StructuredIntake } from "../components/intake/structured-intake";
import { requireProjectAccess } from "../server/access.server";
import { handleFormSave } from "../server/form-save.server";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.$projectId";

/** Step 1, Intake (mock UI 03). Project data comes from the project layout. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  return { target: new URL(request.url).searchParams.get("input") };
}

/** Kept for scripted clients; step pages save through `/projects/:id/form`. */
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  return handleFormSave(request, params.projectId, access.userId);
}

export default function ProjectIntake({ loaderData }: Route.ComponentProps) {
  const flow = useProjectFlow();
  return (
    <div className="flex flex-col gap-6">
      <StructuredIntake
        projectId={flow.project.id}
        initial={flow.form}
        savedAt={flow.savedAt}
        projectFiles={flow.files}
        target={loaderData.target}
      />
      <ProjectFiles projectId={flow.project.id} files={flow.files} />
    </div>
  );
}
