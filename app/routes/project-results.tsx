import { Link, redirect, useRevalidator } from "react-router";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { requireProjectAccess } from "../server/access.server";
import { getLatestResult, getRun } from "../server/output-runs.server";
import { ProjectResultView } from "../components/output/output-workspace";
import {
  RunInputsContext,
  RunSettingsContext,
  type RunSettingsUsed,
} from "../components/output/result-views";
import { settingsUsedByRun } from "../server/team-settings.server";
import { listProjectFiles } from "../server/projects.server";
import { enteredInputs } from "../lib/entered-inputs";
import {
  TEAM_SETTING_KEYS,
  TEAM_SETTING_LABELS,
  formatSetting,
} from "../../shared/team-settings";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/project-results";

const PENDING = ["running", "preflight", "blocked_on_question", "idle"];

/** Step 4, Review (mock UI 06/06a/06b): the pinned run's engine output. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const url = new URL(request.url);
  const runId = url.searchParams.get("run");
  // The report used to be a tab here; it is now its own step.
  if (url.searchParams.get("tab") === "report") {
    const search = new URLSearchParams();
    if (runId) search.set("run", runId);
    const report = url.searchParams.get("report");
    if (report) search.set("report", report);
    throw redirect(
      `/projects/${params.projectId}/report${search.size ? `?${search}` : ""}`,
    );
  }
  const snapshot = runId
    ? await getRun(access, runId)
    : await getLatestResult(access);
  if (runId && !snapshot) throw new Response("Not found", { status: 404 });
  // The team defaults in effect when this run started (#88).
  const used = snapshot
    ? await settingsUsedByRun(access.teamId, {
        started_at: snapshot.run.startedAt.toISOString(),
        settings_version: snapshot.run.settingsVersion,
      })
    : null;
  const settingsUsed: RunSettingsUsed | null = used
    ? {
        version: used.version,
        matches: used.matches,
        rows: TEAM_SETTING_KEYS.map((key) => ({
          key,
          label: TEAM_SETTING_LABELS[key],
          shown: formatSetting(key, used.settings[key].value),
          rationale: used.settings[key].rationale,
          source: used.settings[key].source,
          starting: used.settings[key].starting,
        })),
      }
    : null;
  // The inputs this run pinned when it started, in form order (never the live form).
  const inputs = snapshot
    ? {
        rows: enteredInputs(
          snapshot.run.formJson,
          (await listProjectFiles(access.projectId)).map(({ id, name }) => ({
            id,
            name,
          })),
        ),
      }
    : null;
  return { snapshot, settingsUsed, inputs };
}

export default function ProjectResults({ loaderData }: Route.ComponentProps) {
  const { snapshot, settingsUsed, inputs } = loaderData;
  const { project } = useProjectFlow();
  const revalidator = useRevalidator();
  const pending = !!snapshot && PENDING.includes(snapshot.run.status);
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [pending, revalidator]);
  if (!snapshot?.output)
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">
            {pending
              ? "The run is still working"
              : snapshot
                ? `Run ${snapshot.run.status.replaceAll("_", " ")}`
                : "No result yet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pending
              ? "This page refreshes on its own and shows the output once the engine publishes it."
              : "Start a run from the Process step; the engine output appears here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/projects/${project.id}/process`}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
          >
            Go to Process
          </Link>
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted"
            onClick={() => void revalidator.revalidate()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>
    );
  return (
    <RunSettingsContext.Provider value={settingsUsed}>
      <RunInputsContext.Provider value={inputs}>
        <ProjectResultView
          output={snapshot.output}
          project={{ id: project.id, name: project.name }}
        />
      </RunInputsContext.Provider>
    </RunSettingsContext.Provider>
  );
}
