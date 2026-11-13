import { ClarifyStep } from "../components/clarify/clarify-step";
import { requireProjectAccess } from "../server/access.server";
import { getTeamSettings } from "../server/team-settings.server";
import type {
  OfferedDefault,
  OfferedDefaults,
} from "../../shared/team-settings";
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
  const settings = await getTeamSettings(access.teamId);
  const offer = (key: keyof OfferedDefaults): OfferedDefault => ({
    value: settings[key].value,
    rationale: settings[key].rationale,
    source: settings[key].source,
    starting: settings[key].starting,
  });
  const teamDefaults: OfferedDefaults = {
    discount_rate_pct: offer("discount_rate_pct"),
    recapture_pct: offer("recapture_pct"),
    horizon_years: offer("horizon_years"),
  };
  return {
    target: new URL(request.url).searchParams.get("input"),
    teamDefaults,
  };
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
      teamDefaults={loaderData.teamDefaults}
    />
  );
}
