import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ListChecks,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import type { GapOutput } from "../../../shared/output";
import {
  confidenceSummary,
  inputLabel,
  isNotCountedInHard,
  isSpecified,
  paybackHeadline,
  plainLanguage,
} from "../../lib/output-presentation";
import { cn } from "../../lib/utils";
import {
  AdjustmentChart,
  ContributionChart,
  HardCapacityChart,
  SensitivityChart,
} from "./charts";
import type { ChartId } from "./report-choices";
import {
  confidence,
  labels,
  money,
  percent,
  type Driver,
  type ResultSample,
} from "./samples";

export type OutputNavigation = {
  /** Link to a result tab, optionally to a step/cost reference on it. */
  resultLink: (tab?: string, reference?: string) => string;
  /** Where a gap item sends the user to add evidence. */
  intakeLink: (input?: string, from?: string) => string;
  /** "Edit inputs": back to the saved answers (project mode only). */
  editLink?: string;
  /** "Continue to report" (project mode only). */
  reportLink?: string;
  /** Inside the project shell, which already renders the page H1. */
  embedded: boolean;
};

export const OutputContext = createContext<OutputNavigation>({
  resultLink: () => "/workspace",
  intakeLink: () => "/workspace",
  embedded: false,
});

export const RESULT_TABS = [
  { id: "numbers", label: "Numbers" },
  { id: "charts", label: "Charts" },
  { id: "assumptions", label: "Assumptions" },
] as const;
export type ResultTab = (typeof RESULT_TABS)[number]["id"];

/** `math` was the old show-the-math tab; it now lives under Assumptions. */
export function resultTab(value: string | null): ResultTab {
  if (value === "math") return "assumptions";
  return RESULT_TABS.find((tab) => tab.id === value)?.id ?? "numbers";
}

export function Panel({
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

export function TierCounts({ counts }: { counts: Record<string, number> }) {
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

/** STUB results are sample data and must say so wherever they appear. */
export function RunBadge({ meta }: { meta: ResultSample["meta"] }) {
  return meta.mode === "stub" ? (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      STUB · sample data
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Engine output
    </span>
  );
}

function MathLink({ reference }: { reference: string }) {
  const navigation = useContext(OutputContext);
  return (
    <a
      className="output-ref"
      href={navigation.resultLink("assumptions", reference)}
    >
      {reference}
      <ArrowUpRight aria-hidden="true" size={11} />
    </a>
  );
}

export function Narrative({ value }: { value: string }) {
  const displayValue = plainLanguage(value);
  return (
    <p className="output-narrative">
      {displayValue.split(/(\[[A-Z0-9,\s]+\])/).map((part, index) =>
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

/** Numbers / Charts / Assumptions, as tabs under the step title (mock 06). */
export function ResultTabs({
  current,
  meta,
}: {
  current: ResultTab;
  meta: ResultSample["meta"];
}) {
  const navigation = useContext(OutputContext);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b">
      <nav aria-label="Result views" className="-mb-px flex gap-1">
        {RESULT_TABS.map((tab) => (
          <Link
            key={tab.id}
            to={navigation.resultLink(tab.id)}
            aria-current={tab.id === current ? "page" : undefined}
            preventScrollReset
            className={cn(
              "inline-flex min-h-11 items-center border-b-2 px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab.id === current
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
        <RunBadge meta={meta} />
        <span>
          {meta.label} · {meta.horizon_years} yr · {meta.currency} ·{" "}
          {percent(meta.discount_rate_pct)}
        </span>
      </div>
    </div>
  );
}

type Basis = "capacity_inclusive" | "hard";
const BASES: { id: Basis; label: string }[] = [
  { id: "capacity_inclusive", label: "Capacity-inclusive" },
  { id: "hard", label: "Hard financial" },
];

function Headline({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-[13px] text-muted-foreground">{note}</span>
    </div>
  );
}

function StatusChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "hard" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap",
        tone === "hard" &&
          "border-primary/30 bg-primary/10 text-primary dark:text-primary",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "muted" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MathButton({
  reference,
  label,
}: {
  reference: string;
  label: string;
}) {
  const navigation = useContext(OutputContext);
  return (
    <Link
      to={navigation.resultLink("assumptions", reference)}
      aria-label={`Show the math for ${label}`}
      title="Show the math"
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Sigma size={16} aria-hidden="true" />
    </Link>
  );
}

/** Gross (as entered) vs adjusted, per driver and cost line, from the engine. */
function GrossAdjusted({
  output,
  basis,
}: {
  output: ResultSample;
  basis: Basis;
}) {
  const { currency, horizon_years: years } = output.meta;
  const { drivers, costs } = output.result;
  const group = (label: string) => (
    <tr>
      <th
        colSpan={5}
        scope="colgroup"
        className="bg-muted/60 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </th>
    </tr>
  );
  return (
    <div className="output-table-wrap rounded-2xl border bg-card">
      <table className="min-w-[34rem]">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="text-right">
              Gross
            </th>
            <th scope="col" className="text-right">
              Adjusted
            </th>
            <th scope="col">Status</th>
            <th scope="col" className="w-12">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {group(`Benefits · ${years}-year total`)}
          {drivers.map((driver) => {
            const gross = driver.steps.find((step) => step.name === "gross");
            const notCounted =
              basis === "hard" && isNotCountedInHard(driver.label_class);
            return (
              <tr
                key={driver.id}
                className={cn(
                  !driver.included && "opacity-60",
                  notCounted && "bg-muted/35 text-muted-foreground",
                )}
              >
                <th scope="row" className="text-left font-medium">
                  {driver.label}
                </th>
                <td className="text-right text-muted-foreground tabular-nums">
                  {gross ? money(gross.value, currency) : "—"}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {money(driver.total, currency)}
                </td>
                <td>
                  <StatusChip
                    tone={
                      !driver.included || notCounted
                        ? "muted"
                        : driver.label_class === "hard_savings"
                          ? "hard"
                          : "neutral"
                    }
                  >
                    {!driver.included
                      ? "Excluded"
                      : notCounted
                        ? "Not counted: freed time and avoided loss"
                        : (labels[driver.label_class] ?? driver.label_class)}
                  </StatusChip>
                </td>
                <td>
                  <MathButton
                    reference={driver.steps[0]?.ref ?? driver.id}
                    label={driver.label}
                  />
                </td>
              </tr>
            );
          })}
          {group("Costs · base → with uplift")}
          {costs.lines.map((cost) => (
            <tr key={cost.id}>
              <th scope="row" className="text-left font-medium">
                {cost.label}
              </th>
              <td className="text-right text-muted-foreground tabular-nums">
                {money(cost.base, currency)}
              </td>
              <td className="text-right font-semibold tabular-nums">
                {money(cost.adjusted, currency)}
              </td>
              <td>
                <StatusChip tone="muted">
                  {cost.basis} · +{percent(cost.uplift_pct)}
                </StatusChip>
              </td>
              <td>
                <MathButton reference={cost.ref} label={cost.label} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Review · Numbers (mock 06). */
export function NumbersView({ output }: { output: ResultSample }) {
  const navigation = useContext(OutputContext);
  const [basis, setBasis] = useState<Basis>("capacity_inclusive");
  const { headline, narrative, warnings } = output.result;
  const { currency, horizon_years, discount_rate_pct } = output.meta;
  const reason = (field: string) =>
    headline.null_reasons[field] ?? "Not available";
  const payback = headline.payback[basis];
  const other: Basis = basis === "hard" ? "capacity_inclusive" : "hard";
  return (
    <>
      <div
        role="group"
        aria-label="Valuation basis"
        className="inline-flex gap-1 self-start rounded-xl bg-muted p-1"
      >
        {BASES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={basis === item.id}
            onClick={() => setBasis(item.id)}
            className={cn(
              "min-h-9 rounded-lg px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              basis === item.id
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section
        aria-label="Headline results"
        data-testid="headline"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(13rem,100%),1fr))] gap-4"
      >
        <Headline
          label={`NPV · ${horizon_years} yr`}
          value={money(headline.npv[basis], currency, reason(`npv.${basis}`))}
          // The other basis stays visible, so capacity never reads as cash.
          note={`at ${percent(discount_rate_pct)} · ${other === "hard" ? "hard" : "capacity-incl."} ${money(headline.npv[other], currency, reason(`npv.${other}`))}`}
        />
        <Headline
          label="ROI"
          value={percent(
            headline.roi.undiscounted[basis],
            reason(`roi.undiscounted.${basis}`),
          )}
          note="undiscounted"
        />
        <Headline
          label="ROI on PV"
          value={percent(headline.roi.pv[basis], reason(`roi.pv.${basis}`))}
          note="NPV ÷ PV of costs"
        />
        <Headline
          label="Payback"
          value={paybackHeadline(payback.text)}
          note={
            payback.years === null
              ? "Within the selected horizon"
              : "Uniform-flow estimate"
          }
        />
      </section>
      <div className="flex items-center gap-2 self-start rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm text-primary">
        <ShieldCheck size={15} aria-hidden="true" />
        <strong className="font-medium">
          {confidenceSummary(
            output.result.confidence.project.confidence,
            output.meta.tier_counts,
          )}
        </strong>
      </div>
      <GrossAdjusted output={output} basis={basis} />
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
        <Narrative value={narrative.summary} />
        <p className="output-caption">
          Capacity value is freed time and expected avoided loss is reduced risk
          exposure. Neither is a documented cash reduction.
        </p>
      </div>
      {warnings.length > 0 && (
        <Panel title="Engine warnings">
          {warnings.map((warning) => (
            <p key={warning.code}>
              {plainLanguage(warning.message)}{" "}
              {warning.refs.map((ref) => (
                <MathLink key={ref} reference={ref} />
              ))}
            </p>
          ))}
        </Panel>
      )}
      {(navigation.editLink || navigation.reportLink) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          {navigation.editLink ? (
            <Link
              to={navigation.editLink}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Edit inputs
            </Link>
          ) : (
            <span />
          )}
          {navigation.reportLink && (
            <Link
              to={navigation.reportLink}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
            >
              Continue to report
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** One fixed chart by id; shared by the Charts tab and the report preview. */
export function ChartById({
  id,
  output,
  action,
}: {
  id: ChartId;
  output: ResultSample;
  action?: ReactNode;
}) {
  const { result, meta } = output;
  const props = { currency: meta.currency, action };
  switch (id) {
    case "waterfall":
      return <AdjustmentChart result={result} {...props} />;
    case "driver_mix":
      return <ContributionChart result={result} {...props} />;
    case "hard_capacity":
      return <HardCapacityChart result={result} {...props} />;
    case "npv_discount":
      return (
        <SensitivityChart
          title="NPV by discount rate"
          points={result.sensitivity.discount_rate}
          axisLabel={result.sensitivity.x_labels.discount_rate}
          {...props}
        />
      );
    case "npv_adoption":
      return (
        <SensitivityChart
          title="NPV by adoption"
          points={result.sensitivity.adoption}
          axisLabel={result.sensitivity.x_labels.adoption}
          {...props}
        />
      );
    case "npv_haircut":
      return (
        <SensitivityChart
          title="NPV by evidence discount"
          points={result.sensitivity.haircut}
          axisLabel={plainLanguage(result.sensitivity.x_labels.haircut)}
          {...props}
        />
      );
  }
}

/** Review · Charts (mock 06b): the same three standard charts as the PDF. */
export function ChartsView({ output }: { output: ResultSample }) {
  const navigation = useContext(OutputContext);
  return (
    <>
      <p className="output-muted">
        These three standard charts are included in every PDF.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(30rem,100%),1fr))] gap-5">
        {(["waterfall", "npv_discount", "driver_mix"] as const).map((id) => (
          <ChartById key={id} id={id} output={output} />
        ))}
      </div>
      {navigation.reportLink && (
        <div className="flex justify-end border-t pt-5">
          <Link
            to={navigation.reportLink}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
          >
            Continue to report
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
}

export function DriverMath({
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
          Evidence discount <strong>{percent(driver.haircut_pct)}</strong>
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
                    {step.order}. {plainLanguage(step.label)}
                  </strong>
                </td>
                <td>
                  {plainLanguage(step.formula)}
                  <small>
                    {step.source_type} ·{" "}
                    {step.evidence_tier
                      ? `Evidence level: ${step.evidence_tier}`
                      : "Calculated; no separate evidence level"}
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
      <details className="output-details">
        <summary>
          What makes this vary <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <ul className="output-list">
          {driver.risk_factors.map((risk) => (
            <li key={risk}>{plainLanguage(risk)}</li>
          ))}
        </ul>
        <p className="output-muted">
          Measurement:{" "}
          {isSpecified(driver.measured_by)
            ? plainLanguage(driver.measured_by)
            : "Measurement method to confirm"}
        </p>
      </details>
    </Panel>
  );
}

export function Costs({ output }: { output: ResultSample }) {
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

export function CashFlows({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Cash flows"
      note="Undiscounted · net and cumulative are capacity-inclusive."
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

export function Proxies({ output }: { output: ResultSample }) {
  return (
    <Panel
      title="Inputs from proxies and defaults"
      note="Entered inputs are not yet included in the engine output."
    >
      {output.result.proxies_used.map((proxy) => (
        <div className="output-proxy" key={proxy.input_id}>
          <span>
            <strong>{inputLabel(proxy.input_id)}</strong>
            <small>{proxy.source}</small>
          </span>
          <span>
            {proxy.value} · evidence level: {proxy.tier}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function Evidence({ output }: { output: ResultSample }) {
  const { confidence: ledger } = output.result;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck size={18} aria-hidden="true" className="text-primary" />
          <strong className="tabular-nums">
            {confidence(ledger.project.confidence)}
          </strong>
          <span className="text-sm text-muted-foreground">
            confidence · minimum required {confidence(ledger.project.floor)}
          </span>
        </span>
        <TierCounts counts={output.meta.tier_counts} />
      </div>
      <p className="output-muted">{plainLanguage(ledger.band_note)}</p>
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
    </div>
  );
}

/** Review · Assumptions (mock 06a): settings, show-the-math steps, inputs. */
export function AssumptionsView({ output }: { output: ResultSample }) {
  const { meta } = output;
  const settings = [
    ["Discount", percent(meta.discount_rate_pct)],
    ["Horizon", `${meta.horizon_years} yr`],
    ["Currency", meta.currency],
    ["Scenario", meta.scenario],
    ["Delay", `${output.result.costs.delay_months} mo`],
  ];
  return (
    <>
      <div
        aria-label="Settings"
        className="flex flex-wrap gap-2 text-sm"
        role="group"
      >
        {settings.map(([label, value]) => (
          <span
            key={label}
            className="rounded-full border bg-card px-3 py-1 text-muted-foreground"
          >
            {label} <strong className="text-foreground">{value}</strong>
          </span>
        ))}
      </div>
      <Evidence output={output} />
      {output.result.drivers.map((driver) => (
        <DriverMath key={driver.id} driver={driver} output={output} />
      ))}
      <Costs output={output} />
      <CashFlows output={output} />
      <Proxies output={output} />
    </>
  );
}

export function GapsView({ output }: { output: GapOutput }) {
  const { gap_list: gaps } = output;
  const navigation = useContext(OutputContext);
  const Heading = navigation.embedded ? "h2" : "h1";
  return (
    <>
      <div className="output-gap-intro">
        <span className="output-icon-box">
          <ListChecks size={26} aria-hidden="true" />
        </span>
        <Heading>Build the evidence, then the estimate.</Heading>
        <p>{gaps.reason}. These are next steps, not an error.</p>
      </div>
      <div className="output-gap-summary">
        <span>
          Current project confidence{" "}
          <strong>{confidence(gaps.project_confidence)}</strong>
        </span>
        <span>
          Minimum confidence required{" "}
          <strong>{confidence(gaps.project_floor)}</strong>
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
                Add this evidence
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
            {confidence(driver.confidence)} · minimum required{" "}
            {confidence(driver.floor)}
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

/** The result body for one released run: tab bar and the current tab. */
export function ResultBody({
  output,
  tab,
}: {
  output: ResultSample;
  tab: ResultTab;
}) {
  return (
    <>
      <ResultTabs current={tab} meta={output.meta} />
      {tab === "numbers" ? (
        <NumbersView output={output} />
      ) : tab === "charts" ? (
        <ChartsView output={output} />
      ) : (
        <AssumptionsView output={output} />
      )}
    </>
  );
}
