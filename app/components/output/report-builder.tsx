import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Download, FileText, Info } from "lucide-react";
import type { ResultOutput } from "../../../shared/output";
import {
  inputLabel,
  isSpecified,
  plainLanguage,
} from "../../lib/output-presentation";
import { cn } from "../../lib/utils";
import {
  REPORT_SECTIONS,
  STANDARD_REPORT_CHARTS,
  type SectionId,
} from "./report-choices";
import {
  ChartById,
  Narrative,
  OutputContext,
  RunBadge,
  TierCounts,
  type OutputNavigation,
} from "./result-views";
import { labels, money, percent } from "./samples";
import "./output.css";

type SavedReport = { id: string; createdAt: string };

function Section({
  id,
  title,
  children,
}: {
  id: SectionId;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`report-${id}`}
      className="flex scroll-mt-6 flex-col gap-3"
      aria-labelledby={`report-${id}-title`}
    >
      <h3 id={`report-${id}-title`} className="text-[17px]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Results({ output }: { output: ResultOutput }) {
  const { headline } = output.result;
  const { currency, discount_rate_pct } = output.meta;
  const reason = (field: string) =>
    headline.null_reasons[field] ?? "Not available";
  const rows: [string, string, string][] = [
    [
      `NPV at ${percent(discount_rate_pct)}`,
      money(
        headline.npv.capacity_inclusive,
        currency,
        reason("npv.capacity_inclusive"),
      ),
      money(headline.npv.hard, currency, reason("npv.hard")),
    ],
    [
      "ROI · undiscounted",
      percent(
        headline.roi.undiscounted.capacity_inclusive,
        reason("roi.undiscounted.capacity_inclusive"),
      ),
      percent(headline.roi.undiscounted.hard, reason("roi.undiscounted.hard")),
    ],
    [
      "ROI · NPV / PV of costs",
      percent(
        headline.roi.pv.capacity_inclusive,
        reason("roi.pv.capacity_inclusive"),
      ),
      percent(headline.roi.pv.hard, reason("roi.pv.hard")),
    ],
    [
      "Payback",
      headline.payback.capacity_inclusive.text,
      headline.payback.hard.text,
    ],
  ];
  return (
    <div className="output-table-wrap rounded-xl border">
      <table className="min-w-[28rem]">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="text-right">
              Capacity-inclusive
            </th>
            <th scope="col" className="text-right">
              Hard financial
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, capacity, hard]) => (
            <tr key={label}>
              <th scope="row" className="text-left font-medium">
                {label}
              </th>
              <td className="text-right font-semibold tabular-nums">
                {capacity}
              </td>
              <td className="text-right tabular-nums">{hard}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="output-caption px-4 py-2">
        Benefits PV {money(headline.benefits_pv, currency)} · costs PV{" "}
        {money(headline.costs_pv, currency)}
      </p>
    </div>
  );
}

function Scenarios({ output }: { output: ResultOutput }) {
  const { currency } = output.meta;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3">
      {Object.entries(output.result.scenarios).map(([name, scenario]) => (
        <div
          key={name}
          title={plainLanguage(scenario.what_moved)}
          className={cn(
            "flex flex-col gap-0.5 rounded-xl border p-4",
            name === output.meta.scenario && "border-2 border-primary",
          )}
        >
          <span className="text-sm text-muted-foreground capitalize">
            {name}
            {name === output.meta.scenario ? " · headline" : ""}
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {money(scenario.npv_capacity_inclusive, currency)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            hard {money(scenario.npv_hard, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Assumptions({ output }: { output: ResultOutput }) {
  const { drivers, proxies_used } = output.result;
  return (
    <ul className="flex flex-col divide-y rounded-xl border text-sm">
      {drivers.map((driver) => {
        const gross = driver.steps.find((step) => step.name === "gross");
        return (
          <li
            key={driver.id}
            className="flex flex-wrap justify-between gap-2 px-4 py-3"
          >
            <span className="min-w-0">
              <strong className="font-medium">{driver.label}</strong>
              {gross && (
                <span className="block text-muted-foreground">
                  {plainLanguage(gross.formula)}
                </span>
              )}
            </span>
            <TierCounts counts={driver.tier_counts} />
          </li>
        );
      })}
      {proxies_used.map((proxy) => (
        <li
          key={proxy.input_id}
          className="flex flex-wrap justify-between gap-2 px-4 py-3"
        >
          <span className="min-w-0">
            <strong className="font-medium">
              {inputLabel(proxy.input_id)} = {proxy.value}
            </strong>
            <span className="block text-muted-foreground">{proxy.source}</span>
          </span>
          <span className="text-muted-foreground">
            Evidence level: {proxy.tier}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Preview({
  output,
  project,
}: {
  output: ResultOutput;
  project: { name: string };
}) {
  const { result, meta } = output;
  const render = (id: SectionId) => {
    switch (id) {
      case "summary":
        return (
          <Section key={id} id={id} title="Summary">
            <div className="rounded-xl bg-primary/10 p-4">
              <Narrative value={result.narrative.summary} />
            </div>
            <p className="output-caption">
              Capacity value and expected avoided loss are not documented cash
              reductions.
            </p>
          </Section>
        );
      case "results":
        return (
          <Section
            key={id}
            id={id}
            title={`Results · ${meta.horizon_years} year${meta.horizon_years === 1 ? "" : "s"}`}
          >
            <Results output={output} />
          </Section>
        );
      case "charts":
        return (
          <Section key={id} id={id} title="Charts">
            {STANDARD_REPORT_CHARTS.map((id) => (
              <ChartById key={id} id={id} output={output} />
            ))}
          </Section>
        );
      case "scenarios":
        return (
          <Section key={id} id={id} title="Scenarios">
            <Scenarios output={output} />
          </Section>
        );
      case "assumptions":
        return (
          <Section key={id} id={id} title="Assumptions">
            <Assumptions output={output} />
          </Section>
        );
      case "unquantified":
        return (
          <Section key={id} id={id} title="Unquantified">
            <div className="flex flex-wrap gap-2">
              {result.unquantified.map((item) => (
                <span
                  key={item.target}
                  title={item.reason}
                  className="rounded-full border px-3 py-1 text-sm"
                >
                  {labels[item.target] ?? item.target}
                </span>
              ))}
            </div>
            {result.flexibility.map((value) => (
              <p className="output-muted" key={value}>
                {value}
              </p>
            ))}
          </Section>
        );
      case "risks":
        return (
          <Section key={id} id={id} title="Risks">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium">Doing nothing</h4>
                <ul className="output-list">
                  {result.doing_nothing_risks.map((risk) => (
                    <li key={risk}>{plainLanguage(risk)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium">Proceeding</h4>
                <ul className="output-list">
                  {result.proceeding_risks.map((risk) => (
                    <li key={risk}>{plainLanguage(risk)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        );
      case "measurement":
        return (
          <Section key={id} id={id} title="Measurement plan">
            <div className="output-table-wrap rounded-xl border">
              <table className="min-w-[28rem]">
                <thead>
                  <tr>
                    <th>Driver / metric</th>
                    <th>Baseline</th>
                    <th>Owner · frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.measurement_plan).map(
                    ([key, plan]) => (
                      <tr key={key}>
                        <td>
                          <strong>{labels[key] ?? key}</strong>
                          {isSpecified(plan.metric) && (
                            <small>{plan.metric}</small>
                          )}
                        </td>
                        {[
                          plan.metric,
                          plan.baseline,
                          plan.baseline_source,
                          plan.owner,
                          plan.frequency,
                        ].every((value) => !isSpecified(value)) ? (
                          <td colSpan={2} className="text-muted-foreground">
                            Measurement details to confirm
                          </td>
                        ) : (
                          <>
                            <td>
                              {isSpecified(plan.baseline)
                                ? plan.baseline
                                : "Baseline to confirm"}
                              {isSpecified(plan.baseline_source) && (
                                <small>{plan.baseline_source}</small>
                              )}
                            </td>
                            <td>
                              {isSpecified(plan.owner)
                                ? plan.owner
                                : "Owner to confirm"}
                              {isSpecified(plan.frequency) && (
                                <small>{plan.frequency}</small>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        );
      case "audit": {
        const passed = result.confidence.integrity.checks.filter(
          (check) => check.passed,
        ).length;
        return (
          <Section key={id} id={id} title="Audit trail">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
              {[
                ["Run", meta.run_id],
                [
                  "Mode",
                  meta.mode === "stub" ? "STUB (sample data)" : meta.mode,
                ],
                [
                  "Versions",
                  `contract ${meta.contract_version} · formula ${meta.formula_version} · settings ${meta.settings_version}`,
                ],
                ["Generated", meta.generated_at],
                [
                  "Integrity",
                  `${passed} / ${result.confidence.integrity.checks.length} checks passed`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        );
      }
    }
  };
  return (
    <article
      aria-label="Report preview"
      className="flex min-w-0 flex-[4_1_32rem] flex-col gap-7 rounded-2xl border bg-card p-5 sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px]">{project.name}</h2>
          <p className="output-muted">
            {meta.label} · {meta.currency} · {percent(meta.discount_rate_pct)}{" "}
            discount rate
          </p>
        </div>
        <RunBadge meta={meta} />
      </header>
      {REPORT_SECTIONS.map((section) => render(section.id))}
    </article>
  );
}

/** Report (mock 07): preview the fixed report, then download the PDF. */
export function ReportBuilder({
  output,
  project,
  reports,
  savedReport,
}: {
  output: ResultOutput;
  project: { id: string; name: string };
  reports: SavedReport[];
  savedReport: string | null;
}) {
  const runId = output.meta.run_id;
  const base = `/projects/${project.id}`;
  const reportAction = `${base}/runs/${runId}/reports`;
  const navigation: OutputNavigation = {
    embedded: true,
    resultLink: (tab = "numbers", reference) =>
      `${base}/results?${new URLSearchParams({ run: runId, tab })}${reference ? `#${encodeURIComponent(reference)}` : ""}`,
    intakeLink: () => `${base}/clarify`,
  };
  const [busy, setBusy] = useState(false);
  const fresh = reports.find((report) => report.id === savedReport);
  return (
    <OutputContext.Provider value={navigation}>
      <div className="output-root output-embedded">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <FileText size={18} aria-hidden="true" className="text-primary" />
            <span className="font-semibold">{output.meta.label}</span>
            <RunBadge meta={output.meta} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fresh && (
              <a
                href={`${reportAction}/${fresh.id}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15"
              >
                <Download size={15} aria-hidden="true" />
                PDF ready · download
              </a>
            )}
            {/* A plain document POST: the action saves the PDF to R2 and
                redirects back here with ?report=<id>. */}
            <form
              method="post"
              action={reportAction}
              onSubmit={() => setBusy(true)}
            >
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
              >
                <Download size={15} aria-hidden="true" />
                {busy
                  ? "Generating…"
                  : fresh
                    ? "Generate again"
                    : "Download PDF"}
              </button>
            </form>
          </div>
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          Your PDF includes all sections and the three standard charts.
        </p>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-6 lg:sticky lg:top-6">
            {reports.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer px-1 text-muted-foreground">
                  Saved PDFs ({reports.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {reports.map((report) => (
                    <li key={report.id}>
                      <a
                        className="inline-flex items-center gap-1.5 px-1 text-primary hover:underline"
                        href={`${reportAction}/${report.id}`}
                      >
                        <Download size={13} aria-hidden="true" />
                        {report.createdAt.slice(0, 16).replace("T", " ")} UTC
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <Link
              to={navigation.resultLink()}
              className="px-1 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to review
            </Link>
          </div>
          <Preview output={output} project={project} />
        </div>
      </div>
    </OutputContext.Provider>
  );
}
