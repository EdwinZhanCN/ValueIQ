import { ClarifyStep } from "../components/clarify/clarify-step";
import { requireProjectAccess } from "../server/access.server";
import { offeredDefaults } from "../server/team-settings.server";
import { assistantAvailability } from "../server/assistant.server";
import { evidenceAvailability } from "../server/evidence.server";
import { EvidenceContext } from "../components/clarify/evidence-context";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.clarify";

/**
 * Step 2, Clarify (mock UI 04): the numbers for the goals picked on Intake.
 * Project data comes from the project layout; `?input=<id>` opens and
 * focuses that field's question.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  // The team's financial defaults (#88), offered as "Team default".
  const teamDefaults = await offeredDefaults(access.teamId);
  return {
    target: new URL(request.url).searchParams.get("input"),
    // Intake's Continue sends ?prep=1 so the assistant prepares before the page opens.
    prep: new URL(request.url).searchParams.get("prep") === "1",
    teamDefaults,
    evidence: evidenceAvailability(),
    assistant: assistantAvailability(),
  };
}

export default function ProjectClarify({ loaderData }: Route.ComponentProps) {
  const flow = useProjectFlow();
  return (
    <EvidenceContext.Provider value={loaderData.evidence}>
      <ClarifyStep
        projectId={flow.project.id}
        initial={flow.form}
        savedAt={flow.savedAt}
        files={flow.files}
        target={loaderData.target}
        teamDefaults={loaderData.teamDefaults}
        assistant={loaderData.assistant}
        prep={loaderData.prep}
      />
    </EvidenceContext.Provider>
  );
}
