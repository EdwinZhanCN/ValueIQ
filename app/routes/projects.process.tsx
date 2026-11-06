import { RunAssessment } from "../components/run/run-assessment";
import { requireProjectAccess } from "../server/access.server";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.process";

/** Step 3, Process (mock UI 05): start the run and follow its progress. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  return null;
}

export default function ProjectProcess() {
  const flow = useProjectFlow();
  return (
    <section aria-label="Run assessment" className="rounded-xl border p-4">
      <RunAssessment
        projectId={flow.project.id}
        hasForm={flow.form !== null}
        latest={flow.latest}
      />
    </section>
  );
}
