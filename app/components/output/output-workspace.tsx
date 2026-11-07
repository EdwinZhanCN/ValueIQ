import type { RunOutput } from "../../../shared/output";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  FileText,
  FlaskConical,
} from "lucide-react";
import { BrandWordmark } from "../brand";
import sampleReportUrl from "../../../docs/research/output/pdf-preview/sample-engine-report.pdf?url";
import { inputStepHref } from "../../lib/run-ui";
import { choicesKey } from "./report-choices";
import {
  GapsView,
  OutputContext,
  Panel,
  ResultBody,
  RunBadge,
  resultTab,
  type OutputNavigation,
} from "./result-views";
import { gapSample, resultSample } from "./samples";
import "./output.css";

function IntakeTarget({
  input,
  from,
}: {
  input: string | null;
  from: string | null;
}) {
  return (
    <Panel title="Return to intake" note="Integration handoff">
      <Link
        className="output-text-link"
        to={from === "gap" ? "/workspace?view=gaps" : "/workspace?view=results"}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to output
      </Link>
      <h1 className="output-intake-heading">
        {input ? "Add evidence for this input" : "Review the saved inputs"}
      </h1>
      {input && <code className="output-target-input">{input}</code>}
      <p>
        The requested destination is preserved in the URL. This sample preview
        has no saved intake; no answers have been loaded or changed.
      </p>
    </Panel>
  );
}

/**
 * Review step inside the project shell (`/projects/:id/results`). The shell
 * already renders the breadcrumb, the "Review" title and the step bar, so this
 * renders only the result content.
 */
export function ProjectResultView({
  output,
  project,
}: {
  output: RunOutput;
  project: { id: string; name: string };
}) {
  const [params] = useSearchParams();
  const runId = output.meta.run_id;
  const base = `/projects/${project.id}`;
  const navigation: OutputNavigation = {
    embedded: true,
    choicesKey: choicesKey(project.id, runId),
    resultLink: (tab = "numbers", reference) =>
      `${base}/results?${new URLSearchParams({ run: runId, tab })}${reference ? `#${encodeURIComponent(reference)}` : ""}`,
    // Gap items go to the step that edits the input (Intake for name, goals
    // and files, Clarify for the rest); "Edit inputs" opens Clarify.
    intakeLink: (input) => inputStepHref(project.id, input),
    editLink: `${base}/clarify`,
    reportLink: `${base}/report?${new URLSearchParams({ run: runId })}`,
  };
  return (
    <OutputContext.Provider value={navigation}>
      <div className="output-root output-embedded" aria-label="Review">
        {output.kind === "gap_list" ? (
          <>
            <div className="flex justify-end">
              <RunBadge meta={output.meta} />
            </div>
            <GapsView output={output} />
          </>
        ) : (
          <ResultBody output={output} tab={resultTab(params.get("tab"))} />
        )}
      </div>
    </OutputContext.Provider>
  );
}

/** `/workspace`: the standalone, fixture-driven preview with its own chrome. */
export function OutputWorkspace() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "results";
  const isGap =
    view === "gaps" || (view === "intake" && params.get("from") === "gap");
  const selected = isGap ? gapSample : resultSample;
  const meta = selected.meta;
  const tab = resultTab(params.get("tab"));
  const navigation: OutputNavigation = {
    embedded: false,
    choicesKey: choicesKey(undefined, meta.run_id),
    resultLink: (section = "numbers", reference) =>
      `/workspace?${new URLSearchParams({ view: "results", tab: section })}${reference ? `#${encodeURIComponent(reference)}` : ""}`,
    intakeLink: (input, from = "result") => {
      const search = new URLSearchParams({ view: "intake", from });
      if (input) search.set("input", input);
      return `/workspace?${search}`;
    },
  };
  return (
    <OutputContext.Provider value={navigation}>
      <main className="output-root" aria-label="Agent workspace">
        <aside className="output-sidebar">
          <Link to="/" className="output-brand">
            <BrandWordmark height={26} />
          </Link>
          <div className="output-sidebar-label">ASSESSMENT WORKSPACE</div>
          <Link className="output-project" to={navigation.resultLink()}>
            <span className="output-project-icon">
              <FileText size={18} aria-hidden="true" />
            </span>
            <span>
              Sample project
              <small>Engine output preview</small>
            </span>
          </Link>
          <div className="output-sidebar-bottom">
            <span className="output-sidebar-label">SAMPLE DATA</span>
            <Link
              className="output-sample-link"
              to={isGap ? "/workspace?view=results" : "/workspace?view=gaps"}
            >
              <FlaskConical size={16} aria-hidden="true" />
              {isGap ? "View released sample" : "View gap-list sample"}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
            {!isGap && (
              <a
                className="output-sample-link"
                href={sampleReportUrl}
                download="valueiq-sample-engine-report.pdf"
              >
                <Download size={16} aria-hidden="true" />
                Sample PDF
              </a>
            )}
            <Link
              className="output-muted output-legacy"
              to="/workspace?view=chat"
            >
              Agent UI example
            </Link>
            <p>
              Fixture-driven preview.
              <br />
              No live engine or saved project.
            </p>
          </div>
        </aside>
        <div className="output-main">
          <header className="output-topbar">
            <span>
              Workspace
              <span className="output-breadcrumb">
                /{" "}
                {view === "intake"
                  ? "Intake handoff"
                  : isGap
                    ? "Evidence gaps"
                    : "Review"}
              </span>
            </span>
            <div>
              <Link
                className="output-sample-switch"
                to={isGap ? "/workspace?view=results" : "/workspace?view=gaps"}
              >
                {isGap ? "Result sample" : "Gap-list sample"}
              </Link>
              <span className="output-stub">
                {meta.mode === "stub" ? "STUB" : "ENGINE OUTPUT"}
              </span>
              <span className="output-topbar-label">{meta.label}</span>
            </div>
          </header>
          <div className="output-scroll">
            <div className="output-content">
              <div className="output-run-label">
                <span>{meta.run_id}</span>
                <span>
                  Contract {meta.contract_version} · formula{" "}
                  {meta.formula_version}
                </span>
              </div>
              {view === "intake" ? (
                <IntakeTarget
                  input={params.get("input")}
                  from={params.get("from")}
                />
              ) : selected.kind === "gap_list" ? (
                <GapsView output={selected} />
              ) : (
                <>
                  <h1>Review</h1>
                  <ResultBody output={selected} tab={tab} />
                </>
              )}
              <footer className="output-footer">
                <span>
                  <FlaskConical size={13} aria-hidden="true" />
                  {meta.mode === "stub" ? "STUB · " : ""}
                  Supplied engine samples; no live assessment
                </span>
                <span>
                  Settings {meta.settings_version} · {meta.generated_at}
                </span>
              </footer>
            </div>
          </div>
        </div>
      </main>
    </OutputContext.Provider>
  );
}
