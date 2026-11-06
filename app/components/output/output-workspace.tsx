import { createContext, useContext, useState, type ReactNode } from "react";
import type { RunOutput, GapOutput } from "../../../shared/output";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  FileText,
  FlaskConical,
  ListChecks,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { BrandWordmark } from "../brand";
import sampleReportUrl from "../../../docs/research/output/pdf-preview/sample-engine-report.pdf?url";
import { AdjustmentChart, ContributionChart, SensitivityChart } from "./charts";
import {
  confidence,
  gapSample,
  labels,
  money,
  percent,
  resultSample,
  type Driver,
  type ResultSample,
} from "./samples";
import "./output.css";

type OutputNavigation = {
  resultLink: (tab?: string, reference?: string) => string;
  intakeLink: (input?: string, from?: string) => string;
  project?: { id: string; name: string };
  reportAction?: string;
  reports: { id: string; createdAt: string }[];
};
const OutputContext = createContext<OutputNavigation>({
  resultLink: (tab = "numbers", reference) =>
    `/workspace?view=results&tab=${tab}${reference ? `#${encodeURIComponent(reference)}` : ""}`,
  intakeLink: (input, from = "result") =>
    `/workspace?view=intake&from=${from}${input ? `&input=${encodeURIComponent(input)}` : ""}`,
  reports: [],
});

const sections = [
  { id: "numbers", label: "Numbers", icon: FileText },
  { id: "math", label: "Show the math", icon: Sigma },
  { id: "charts", label: "Charts", icon: ChartNoAxesCombined },
  { id: "report", label: "Report", icon: ListChecks },
];

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="output-card">
      <div className="output-panel-heading">
        <h2>{title}</h2>
        {note && <p className="output-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function TierCounts({ counts }: { counts: Record<string, number> }) {
  return (
    <span className="output-tier-counts">
      {Object.entries(counts).map(([tier, count]) => (
        <span key={tier}>
          <strong>{count}</strong> {tier}
        </span>
      ))}
    </span>
  );
}

function MathLink({ reference }: { reference: string }) {
  const navigation = useContext(OutputContext);
  return (
    <a className="output-ref" href={navigation.resultLink("math", reference)}>
      {reference}
      <ArrowUpRight aria-hidden="true" size={11} />
    </a>
  );
}

function Narrative({ value }: { value: string }) {
  return (
    <p className="output-narrative">
      {value.split(/(\[[A-Z0-9,\s]+\])/).map((part, index) =>
        /^\[/.test(part) ? (
          <span key={index}>
            {part
              .slice(1, -1)
              .split(",")
              .map((reference) => (
                <MathLink key={reference} reference={reference.trim()} />
              ))}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function Backing({ output }: { output: ResultSample }) {
  const { confidence: ledger } = output.result;
  return (
    <Panel
      title="Evidence behind the estimate"
      note="Read alongside every headline figure."
    >
      <div className="output-confidence">
        <ShieldCheck aria-hidden="true" size={24} />
        <div>
          <strong>{confidence(ledger.project.confidence)}</strong>
          <span>
            project confidence · floor {confidence(ledger.project.floor)}
          </span>
        </div>
      </div>
      <p className="output-muted">{ledger.band_note}</p>
      <TierCounts counts={output.meta.tier_counts} />
      {ledger.project.capped_by && (
        <p className="output-caption">
          Confidence is capped by{" "}
          {labels[ledger.project.capped_by] ?? ledger.project.capped_by}.
        </p>
      )}
      <details className="output-details">
        <summary>
          Engine integrity checks <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <ul className="output-checks">
          {ledger.integrity.checks.map((check) => (
            <li key={check.name}>
              <Check size={13} aria-hidden="true" />
              {check.name}: {check.passed ? "passed" : "not passed"}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

function DriverTable({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Benefits by driver"
      note="Adjusted values; hard savings, capacity and expected avoided loss remain distinct."
    >
      <div className="output-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Driver / classification</th>
              <th>Haircut</th>
              <th>Confidence</th>
              <th>Horizon total</th>
              <th>Present value</th>
              <th>Audit</th>
            </tr>
          </thead>
          <tbody>
            {output.result.drivers.map((driver) => (
              <tr key={driver.id}>
                <td>
                  <strong>{driver.label}</strong>
                  <small>
                    {labels[driver.label_class]} ·{" "}
                    {driver.included ? "included" : "excluded"}
                  </small>
                </td>
                <td>{percent(driver.haircut_pct)}</td>
                <td>
                  {confidence(driver.confidence)}
                  <small>
                    <TierCounts counts={driver.tier_counts} />
                  </small>
                </td>
                <td>{money(driver.total, output.meta.currency)}</td>
                <td>{money(driver.pv, output.meta.currency)}</td>
                <td>
                  <MathLink reference={driver.steps[0]?.ref ?? driver.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Numbers({ output }: { output: ResultSample }) {
  const { headline, narrative } = output.result;
  const nullReason = (field: string) =>
    headline.null_reasons[field] ?? "Not available";
  return (
    <>
      <div className="output-overview">
        <div className="output-stack">
          <div className="output-headlines" data-testid="headline">
            {(["hard", "capacity_inclusive"] as const).map((basis) => (
              <section
                className={`output-card output-headline output-headline-${basis}`}
                key={basis}
              >
                <span className="output-eyebrow">
                  {basis === "hard" ? "Hard savings" : "Capacity-inclusive"}
                </span>
                <p className="output-muted">Net present value</p>
                <strong className="output-big-number">
                  {money(
                    headline.npv[basis],
                    output.meta.currency,
                    nullReason(`npv.${basis}`),
                  )}
                </strong>
                <div className="output-headline-rule" />
                <span className="output-caption">Payback</span>
                <p>{headline.payback[basis].text}</p>
              </section>
            ))}
          </div>
          <Panel
            title="Two definitions of return"
            note="Both definitions are supplied by the engine."
          >
            <div className="output-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>Hard savings</th>
                    <th>Capacity-inclusive</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>ROI · undiscounted</td>
                    <td>
                      {percent(
                        headline.roi.undiscounted.hard,
                        nullReason("roi.undiscounted.hard"),
                      )}
                    </td>
                    <td>
                      {percent(
                        headline.roi.undiscounted.capacity_inclusive,
                        nullReason("roi.undiscounted.capacity_inclusive"),
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>ROI · NPV / PV of costs</td>
                    <td>
                      {percent(headline.roi.pv.hard, nullReason("roi.pv.hard"))}
                    </td>
                    <td>
                      {percent(
                        headline.roi.pv.capacity_inclusive,
                        nullReason("roi.pv.capacity_inclusive"),
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Benefits · present value</td>
                    <td colSpan={2}>
                      {money(headline.benefits_pv, output.meta.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td>Costs · present value</td>
                    <td colSpan={2}>
                      {money(headline.costs_pv, output.meta.currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <Backing output={output} />
      </div>
      <Panel title="What this estimate says">
        <Narrative value={narrative.summary} />
        <p className="output-caption">
          Capacity value is freed time. Expected avoided loss is an estimate of
          risk exposure reduced. Neither establishes a documented cash
          reduction.
        </p>
      </Panel>
      <DriverTable output={output} />
      <AdditionalEvidence output={output} />
    </>
  );
}

function DriverMath({
  driver,
  output,
}: {
  driver: Driver;
  output: ResultSample;
}) {
  return (
    <Panel
      title={driver.label}
      note={`${labels[driver.label_class]} · ${driver.included ? "included" : "excluded"}`}
    >
      <div className="output-inline-facts">
        <span>
          Haircut <strong>{percent(driver.haircut_pct)}</strong>
        </span>
        <span>
          Confidence <strong>{confidence(driver.confidence)}</strong>
        </span>
        <TierCounts counts={driver.tier_counts} />
      </div>
      <div className="output-table-wrap">
        <table className="output-math-table">
          <thead>
            <tr>
              <th>Ref / ordered step</th>
              <th>Formula and source</th>
              {driver.annual.map((row) => (
                <th key={row.year}>Year {row.year}</th>
              ))}
              <th>Horizon total</th>
            </tr>
          </thead>
          <tbody>
            {driver.steps.map((step) => (
              <tr key={step.ref} id={step.ref} tabIndex={-1}>
                <td>
                  <span className="output-ref-label">{step.ref}</span>
                  <strong>
                    {step.order}. {step.label}
                  </strong>
                </td>
                <td>
                  {step.formula}
                  <small>
                    {step.source_type} ·{" "}
                    {step.evidence_tier ??
                      "Calculated; no separate evidence tier"}
                  </small>
                </td>
                {step.by_year.map((value, i) => (
                  <td key={i}>{money(value, output.meta.currency)}</td>
                ))}
                <td>{money(step.value, output.meta.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="output-caption">
        The sample supplies formulas and yearly outputs; its individual step
        input arrays are empty. A full entered-input snapshot is still needed
        from the input/engine integration.
      </p>
      <h3 className="output-subheading">What makes this vary</h3>
      <ul className="output-list">
        {driver.risk_factors.map((risk) => (
          <li key={risk}>{risk}</li>
        ))}
      </ul>
      <p className="output-muted">Measurement: {driver.measured_by}</p>
    </Panel>
  );
}

function Costs({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Costs and uplift"
      note={`Costs PV ${money(output.result.costs.total_pv, output.meta.currency)} · schedule delay ${output.result.costs.delay_months} months`}
    >
      <div className="output-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref / cost</th>
              <th>Basis</th>
              <th>Base</th>
              <th>Uplift</th>
              <th>Adjusted</th>
            </tr>
          </thead>
          <tbody>
            {output.result.costs.lines.map((cost) => (
              <tr key={cost.id} id={cost.ref} tabIndex={-1}>
                <td>
                  <span className="output-ref-label">{cost.ref}</span>
                  {cost.label}
                </td>
                <td>{cost.basis}</td>
                <td>{money(cost.base, output.meta.currency)}</td>
                <td>{percent(cost.uplift_pct)}</td>
                <td>{money(cost.adjusted, output.meta.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CashFlows({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Cash flows"
      note="Undiscounted values · net and cumulative are capacity-inclusive as supplied by this sample."
    >
      <div className="output-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Hard benefit</th>
              <th>Capacity / avoided loss</th>
              <th>Costs</th>
              <th>Net · inclusive</th>
              <th>Cumulative · inclusive</th>
            </tr>
          </thead>
          <tbody>
            {output.result.cash_flows.map((row) => (
              <tr key={row.year}>
                <td>{row.year === 0 ? "Time zero" : `Year ${row.year}`}</td>
                <td>{money(row.benefits_hard, output.meta.currency)}</td>
                <td>{money(row.benefits_capacity, output.meta.currency)}</td>
                <td>{money(row.costs, output.meta.currency)}</td>
                <td>{money(row.net, output.meta.currency)}</td>
                <td>{money(row.cumulative, output.meta.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Scenarios({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Scenarios"
      note="Prepared by the engine; selecting a view does not run a new calculation."
    >
      <div className="output-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scenario / what moved</th>
              <th>NPV · hard</th>
              <th>NPV · inclusive</th>
              <th>ROI · PV-based, inclusive</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(output.result.scenarios).map(([name, scenario]) => (
              <tr key={name}>
                <td>
                  <strong className="capitalize">{name}</strong>
                  <small>{scenario.what_moved}</small>
                </td>
                <td>{money(scenario.npv_hard, output.meta.currency)}</td>
                <td>
                  {money(scenario.npv_capacity_inclusive, output.meta.currency)}
                </td>
                <td>{percent(scenario.roi_pv_capacity_inclusive)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AdditionalEvidence({ output }: { output: ResultSample }) {
  const { result } = output;
  const warnings: { code: string; message: string; refs: string[] }[] =
    result.warnings;
  const overrides: {
    path: string;
    computed_value: number;
    override_value: number;
    reason: string;
    author: string;
    at: string;
  }[] = result.overrides;
  return (
    <>
      {warnings.length > 0 && (
        <Panel title="Engine warnings">
          {warnings.map((warning) => (
            <p key={warning.code}>
              {warning.message}{" "}
              {warning.refs.map((ref) => (
                <MathLink key={ref} reference={ref} />
              ))}
            </p>
          ))}
        </Panel>
      )}
      <div className="output-two-columns">
        <Panel title="Unquantified benefits">
          {result.unquantified.map((item) => (
            <div className="output-text-item" key={item.target}>
              <h3>{labels[item.target] ?? item.target}</h3>
              <p>{item.reason}</p>
              <p className="output-muted">What to add: {item.raise_with}</p>
            </div>
          ))}
          <h3 className="output-subheading">Flexibility</h3>
          {result.flexibility.map((value) => (
            <p className="output-muted" key={value}>
              {value}
            </p>
          ))}
        </Panel>
        <Panel title="Risks and tradeoffs">
          <h3>Doing nothing</h3>
          <ul className="output-list">
            {result.doing_nothing_risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
          <h3>Proceeding</h3>
          <ul className="output-list">
            {result.proceeding_risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Measurement plan">
        <div className="output-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver / metric</th>
                <th>Baseline / source</th>
                <th>Owner</th>
                <th>Frequency</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.measurement_plan).map(([id, plan]) => (
                <tr key={id}>
                  <td>
                    <strong>{labels[id] ?? id}</strong>
                    {plan.metric}
                  </td>
                  <td>
                    {plan.baseline}
                    <small>{plan.baseline_source}</small>
                  </td>
                  <td>{plan.owner}</td>
                  <td>{plan.frequency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Accepted proxies and defaults">
        {result.proxies_used.map((proxy) => (
          <div className="output-proxy" key={proxy.input_id}>
            <span>
              <strong>{proxy.input_id}</strong>
              <small>{proxy.source}</small>
            </span>
            <span>
              {proxy.value} · {proxy.tier}
            </span>
          </div>
        ))}
      </Panel>
      {overrides.length > 0 && (
        <Panel title="Recorded overrides">
          {overrides.map((item) => (
            <p key={item.path}>
              {item.path}: computed {money(item.computed_value)}, override{" "}
              {money(item.override_value)} · {item.reason} · {item.author} ·{" "}
              {item.at}
            </p>
          ))}
        </Panel>
      )}
    </>
  );
}

function Charts({ output }: { output: ResultSample }) {
  const [series, setSeries] = useState<
    "discount_rate" | "adoption" | "haircut"
  >("discount_rate");
  return (
    <>
      <div className="output-two-columns">
        <AdjustmentChart
          currency={output.meta.currency}
          result={output.result}
        />
        <ContributionChart
          currency={output.meta.currency}
          result={output.result}
        />
      </div>
      <div className="output-field">
        <label htmlFor="sensitivity-series">Sensitivity view</label>
        <select
          id="sensitivity-series"
          value={series}
          onChange={(event) => setSeries(event.target.value as typeof series)}
        >
          <option value="discount_rate">Discount rate</option>
          <option value="adoption">Adoption</option>
          <option value="haircut">Evidence haircut</option>
        </select>
      </div>
      <SensitivityChart
        currency={output.meta.currency}
        points={output.result.sensitivity[series]}
        axisLabel={output.result.sensitivity.x_labels[series]}
      />
      <Scenarios output={output} />
      <CashFlows output={output} />
    </>
  );
}

function Report({ output }: { output: ResultSample }) {
  const navigation = useContext(OutputContext);
  return (
    <>
      <Panel
        title="Report preview"
        note="Uses the same supplied result as the Numbers, Math and Charts views."
      >
        {navigation.project ? (
          <>
            <div className="output-notice">
              <FileText size={20} aria-hidden="true" />
              <div>
                <strong>Report for this recorded run</strong>
                <p>
                  Generate the PDF from the stored engine output and save it
                  privately in Cloudflare R2. Earlier reports remain available.
                </p>
              </div>
            </div>
            <form method="post" action={navigation.reportAction}>
              <button
                type="submit"
                className="output-button output-button-outline"
              >
                Generate and save PDF
              </button>
            </form>
            {navigation.reports.length > 0 && (
              <ul className="output-list">
                {navigation.reports.map((report) => (
                  <li key={report.id}>
                    <a href={`${navigation.reportAction}/${report.id}`}>
                      Download saved PDF · {report.createdAt}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="output-notice">
              <FileText size={20} aria-hidden="true" />
              <div>
                <strong>Fixed sample report</strong>
                <p>
                  This preview download uses the supplied sample. Open a saved
                  project's results to generate and store its report.
                </p>
              </div>
            </div>
            <a
              className="output-button output-button-outline"
              href={sampleReportUrl}
              download="valueiq-sample-engine-report.pdf"
            >
              Download sample PDF <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </>
        )}
        <p className="output-muted">
          The required outline covers summary, context, benefits, costs,
          unquantified value, financial summary, scenarios, risks, measurement
          and audit trail.
        </p>
      </Panel>
      <Numbers output={output} />
      <Costs output={output} />
      <CashFlows output={output} />
      <Scenarios output={output} />
      <AdjustmentChart currency={output.meta.currency} result={output.result} />
      <ContributionChart
        currency={output.meta.currency}
        result={output.result}
      />
      <SensitivityChart
        currency={output.meta.currency}
        points={output.result.charts.sensitivity}
        axisLabel={output.result.sensitivity.x_labels.discount_rate}
      />
      {output.result.drivers.map((driver) => (
        <DriverMath key={driver.id} driver={driver} output={output} />
      ))}
    </>
  );
}

function Gaps({ output }: { output: GapOutput }) {
  const { gap_list: gaps } = output;
  const navigation = useContext(OutputContext);
  return (
    <>
      <div className="output-gap-intro">
        <span className="output-icon-box">
          <ListChecks size={26} aria-hidden="true" />
        </span>
        <h1>Build the evidence, then the estimate.</h1>
        <p>{gaps.reason}. These are next steps, not an error.</p>
      </div>
      <div className="output-gap-summary">
        <span>
          Current project confidence{" "}
          <strong>{confidence(gaps.project_confidence)}</strong>
        </span>
        <span>
          Release floor <strong>{confidence(gaps.project_floor)}</strong>
        </span>
      </div>
      <TierCounts counts={output.meta.tier_counts} />
      <div className="output-stack">
        {gaps.items.map((item) => (
          <section className="output-card output-gap-card" key={item.rank}>
            <span className="output-rank">{item.rank}</span>
            <div>
              <h2>{item.label}</h2>
              <p>{item.what_to_add}</p>
              <div className="output-gap-confidence">
                <span>{confidence(item.confidence_now)} now</span>
                <ArrowRight size={16} aria-hidden="true" />
                <strong>
                  {confidence(item.confidence_if_added)} with this evidence
                </strong>
              </div>
              <Link
                className="output-button output-button-outline"
                to={navigation.intakeLink(item.return_to.input_id, "gap")}
              >
                Go to intake field
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>
        ))}
      </div>
      <Panel title="Drivers awaiting evidence">
        {gaps.dropped_drivers.map((driver) => (
          <p key={driver.id}>
            {labels[driver.id] ?? driver.id}: confidence{" "}
            {confidence(driver.confidence)} · floor {confidence(driver.floor)}
          </p>
        ))}
      </Panel>
      <p className="output-caption">
        The evidence options and their order are supplied by the engine.
        Improvements are alternatives, not amounts to add together.
      </p>
    </>
  );
}

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
        The requested destination is preserved in the URL. The saved intake form
        is not connected in this preview; no answers have been loaded or
        changed.
      </p>
      <p className="output-muted">
        The input team’s saved form will mount here through the agreed project
        route. Returning with answers preserved must be verified when that API
        is available.
      </p>
    </Panel>
  );
}

export function OutputWorkspace({
  storedOutput,
  project,
  reports = [],
}: {
  storedOutput?: RunOutput;
  project?: { id: string; name: string };
  reports?: { id: string; createdAt: string }[];
} = {}) {
  const [params] = useSearchParams();
  const view = storedOutput
    ? storedOutput.kind === "gap_list"
      ? "gaps"
      : "results"
    : (params.get("view") ?? "results");
  const selected =
    storedOutput ??
    (view === "gaps" || (view === "intake" && params.get("from") === "gap")
      ? gapSample
      : resultSample);
  const tab = sections.some((item) => item.id === params.get("tab"))
    ? params.get("tab")!
    : "numbers";
  const output = selected.kind === "result" ? selected : null;
  const isGap = selected.kind === "gap_list";
  const meta = selected.meta;
  const resultLink = (section = "numbers", reference?: string) => {
    const search = new URLSearchParams(
      project
        ? { run: meta.run_id, tab: section }
        : { view: "results", tab: section },
    );
    return `${project ? `/projects/${project.id}/results` : "/workspace"}?${search}${reference ? `#${encodeURIComponent(reference)}` : ""}`;
  };
  const intakeLink = (input?: string, from = "result") => {
    const search = new URLSearchParams(
      project ? { run: meta.run_id } : { view: "intake", from },
    );
    if (input) search.set("input", input);
    return `${project ? `/projects/${project.id}` : "/workspace"}?${search}`;
  };
  const navigation = {
    project,
    resultLink,
    intakeLink,
    reports,
    reportAction: project
      ? `/projects/${project.id}/runs/${meta.run_id}/reports`
      : undefined,
  };
  return (
    <OutputContext.Provider value={navigation}>
      <main className="output-root" aria-label="Agent workspace">
        <aside className="output-sidebar">
          <Link to={project ? "/projects" : "/"} className="output-brand">
            <BrandWordmark height={26} />
          </Link>
          <div className="output-sidebar-label">ASSESSMENT WORKSPACE</div>
          <Link className="output-project" to={resultLink()}>
            <span className="output-project-icon">
              <FileText size={18} aria-hidden="true" />
            </span>
            <span>
              {project?.name ?? "Sample project"}
              <small>
                {storedOutput
                  ? "Recorded engine output"
                  : "Engine output preview"}
              </small>
            </span>
          </Link>
          <nav aria-label="Output navigation">
            {isGap ? (
              <Link
                className="active"
                aria-current="page"
                to={
                  project
                    ? `/projects/${project.id}/results?run=${meta.run_id}`
                    : "/workspace?view=gaps"
                }
              >
                <ListChecks size={17} aria-hidden="true" />
                Evidence to add
              </Link>
            ) : (
              sections.map((item) => (
                <Link
                  key={item.id}
                  className={
                    view !== "intake" && tab === item.id ? "active" : ""
                  }
                  aria-current={
                    view !== "intake" && tab === item.id ? "page" : undefined
                  }
                  to={resultLink(item.id)}
                >
                  <item.icon size={17} aria-hidden="true" />
                  {item.label}
                </Link>
              ))
            )}
          </nav>
          <div className="output-sidebar-bottom">
            {project ? (
              <>
                <Link className="output-sample-link" to={intakeLink()}>
                  Saved intake <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
                <Link className="output-muted output-legacy" to="/projects">
                  All projects
                </Link>
                <p>
                  Report data stays pinned
                  <br />
                  to the selected engine run.
                </p>
              </>
            ) : (
              <>
                <span className="output-sidebar-label">SAMPLE DATA</span>
                <Link
                  className="output-sample-link"
                  to={
                    isGap ? "/workspace?view=results" : "/workspace?view=gaps"
                  }
                >
                  <FlaskConical size={16} aria-hidden="true" />
                  {isGap ? "View released sample" : "View gap-list sample"}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
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
              </>
            )}
          </div>
        </aside>
        <div className="output-main">
          <header className="output-topbar">
            <span>
              {project ? "Project" : "Workspace"}
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
              {!project && (
                <Link
                  className="output-sample-switch"
                  to={
                    isGap ? "/workspace?view=results" : "/workspace?view=gaps"
                  }
                >
                  {isGap ? "Result sample" : "Gap-list sample"}
                </Link>
              )}
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
                <Gaps output={selected} />
              ) : output ? (
                <>
                  <div className="output-page-heading">
                    <div>
                      <p className="output-eyebrow">Review the business case</p>
                      <h1>
                        {tab === "numbers"
                          ? "The value, with its evidence."
                          : sections.find((item) => item.id === tab)?.label}
                      </h1>
                      <p className="output-muted">
                        {meta.horizon_years}-year estimate · {meta.currency} ·{" "}
                        {percent(meta.discount_rate_pct)} discount rate ·
                        expected scenario
                      </p>
                    </div>
                    <Link
                      className="output-button output-button-outline"
                      to={intakeLink()}
                    >
                      <ArrowLeft size={14} aria-hidden="true" />
                      Review inputs
                    </Link>
                  </div>
                  <nav
                    className="output-mobile-tabs"
                    aria-label="Result sections"
                  >
                    {sections.map((item) => (
                      <Link
                        key={item.id}
                        aria-current={tab === item.id ? "page" : undefined}
                        to={resultLink(item.id)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  {tab !== "numbers" && (
                    <div className="output-backing-strip">
                      <ShieldCheck size={16} aria-hidden="true" />
                      <span>{output.result.confidence.band_note}</span>
                      <TierCounts counts={meta.tier_counts} />
                    </div>
                  )}
                  {tab === "numbers" ? (
                    <Numbers output={output} />
                  ) : tab === "math" ? (
                    <>
                      <p className="output-muted">
                        Ordered engine steps. Yearly values and horizon totals
                        are displayed as supplied.
                      </p>
                      {output.result.drivers.map((driver) => (
                        <DriverMath
                          key={driver.id}
                          driver={driver}
                          output={output}
                        />
                      ))}
                      <Costs output={output} />
                    </>
                  ) : tab === "charts" ? (
                    <Charts output={output} />
                  ) : (
                    <Report output={output} />
                  )}
                </>
              ) : null}
              <footer className="output-footer">
                <span>
                  <FlaskConical size={13} aria-hidden="true" />
                  {meta.mode === "stub" ? "STUB · " : ""}
                  {storedOutput
                    ? "Recorded engine output"
                    : "Supplied engine samples; no live assessment"}
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
