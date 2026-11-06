import { ClarifyStep } from "../components/clarify/clarify-step";
import { requireProjectAccess } from "../server/access.server";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.clarify";

/**
 * Step 2, Clarify (mock UI 04): the numbers for the goals picked on Intake.
 * Project data comes from the project layout; `?input=<id>` opens and
 * focuses that field's question.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  return { target: new URL(request.url).searchParams.get("input") };
}

export default function ProjectClarify({ loaderData }: Route.ComponentProps) {
  const flow = useProjectFlow();
  return (
    <ClarifyStep
      projectId={flow.project.id}
      initial={flow.form}
      savedAt={flow.savedAt}
      files={flow.files}
      target={loaderData.target}
    />
  );
}
