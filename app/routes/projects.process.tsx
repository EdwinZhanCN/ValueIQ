import { useMemo } from "react";
import { env } from "cloudflare:workers";
import { demoControlsOn } from "../lib/demo-controls";
import { RunAssessment } from "../components/run/run-assessment";
import { validateFormFile } from "../lib/intake-form";
import { missingInputs } from "../lib/run-ui";
import { requireProjectAccess } from "../server/access.server";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.process";

/** Step 3, Process (mock UI 05): start the run and follow its progress. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  // Only a boolean leaves the server; the agent re-checks the switch itself.
  return {
    demoControls: demoControlsOn(env as unknown as Record<string, unknown>),
  };
}

export default function ProjectProcess({ loaderData }: Route.ComponentProps) {
  const flow = useProjectFlow();
  const { project, form, files } = flow;
  // The same strict check the layout's `complete` flag uses, kept per field
  // so the card can say what Clarify still needs.
  const missing = useMemo(
    () =>
      form === null
        ? []
        : missingInputs(
            validateFormFile(form, {
              projectId: project.id,
              files: files.map((file) => ({
                id: file.id,
                projectId: project.id,
              })),
            }),
          ),
    [form, files, project.id],
  );
  return (
    <RunAssessment
      projectId={project.id}
      hasForm={form !== null}
      missing={missing}
      latest={flow.latest}
      demoControls={loaderData.demoControls}
    />
  );
}
