import { useRef, useState } from "react";
import { Link } from "react-router";
import { Download, FileText, Plus, Target, Trash2 } from "lucide-react";
import sample from "../../../docs/research/samples/sample-result.form.json";
import type {
  Backing,
  FormContext,
  FormFile,
  FormIssue,
  Goal,
  Input,
} from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { DEFAULTS, GOAL_LABELS, LABELS } from "../../lib/intake-fields";
import {
  parseFormFile,
  serializeFormFile,
  validateFormFile,
} from "../../lib/intake-form";

type FileGroup = {
  id: string;
  files: { id: string; name: string }[];
  description: string;
};
const control =
  "block w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const action =
  "rounded-lg border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const pretty = (value: Input["value"]) =>
  value === null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
const sampleContext: FormContext = {
  projectId: "local-intake",
  files: [{ id: "f1", projectId: "local-intake" }],
};
const sourceChoices = [
  ["estimate", "My best estimate"],
  ["documented", "Written source about our organization"],
  ["benchmark", "Comparable industry benchmark"],
  ["assumption", "Unverified assumption"],
  ["measured", "System record with confirmed passage"],
] as const;

export function StructuredIntake() {
  const [selected, setSelected] = useState<Goal[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [horizon, setHorizon] = useState("");
  const acceptedHorizon = useRef("");
  const [records, setRecords] = useState<Input[]>([]);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [plans, setPlans] = useState<FormFile["measurement_plan"]>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [files, setFiles] = useState<FileGroup[]>([]);
  const [sampleMode, setSampleMode] = useState(false);
  const [sampleEdited, setSampleEdited] = useState(false);
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [fileError, setFileError] = useState("");
  const [json, setJson] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const [timePath, setTimePath] = useState("hours");
  const [qualityPath, setQualityPath] = useState("counts");
  const [errorCostPath, setErrorCostPath] = useState("direct");
  const [riskPath, setRiskPath] = useState("direct");
  const context: FormContext = {
    projectId: "local-intake",
    files: files.flatMap((group) =>
      group.files.map((file) => ({ id: file.id, projectId: "local-intake" })),
    ),
  };
  const sections = [
    { title: "Project context", ids: ["project_name", "decision_statement"] },
    {
      title: "Financial settings",
      ids: ["discount_rate_pct", "adoption_by_year"],
    },
    {
      title: "Project costs",
      ids: [
        "cost_one_time_vendor_license",
        "cost_training_change",
        "cost_annual_run",
        "cost_one_time_internal_labor",
        "cost_annual_internal_support",
        "cost_uplift_pct",
        "delay_months",
        "baseline_alternative",
      ],
    },
    ...(selected.includes("time_savings")
      ? [
          {
            title: "Time savings",
            ids: [
              "staff_affected",
              ...(timePath === "hours"
                ? ["hours_saved_per_staff_week"]
                : [
                    "minutes_per_task_before",
                    "minutes_per_task_after",
                    "tasks_per_staff_week",
                  ]),
              "weeks_per_year",
              "loaded_hourly_cost",
              "recapture_pct",
              "realized_as_cash",
            ],
          },
        ]
      : []),
    ...(selected.includes("data_quality")
      ? [
          {
            title: "Data quality",
            ids: [
              ...(qualityPath === "counts"
                ? ["error_count_before", "error_count_after"]
                : [
                    "records_or_events_per_year",
                    "error_rate_before",
                    "error_rate_after",
                  ]),
              ...(errorCostPath === "direct"
                ? ["cost_per_error"]
                : ["cost_per_clean_unit", "error_cost_multiplier"]),
              "cost_sources",
              "stages_downstream",
            ],
          },
        ]
      : []),
    ...(selected.includes("decision_speed")
      ? [
          {
            title: "Decision speed",
            ids: [
              "decisions_per_year",
              "days_to_decide_before",
              "days_to_decide_after",
              "cost_of_delay_per_day",
              "cost_of_delay_basis",
              "example_decision",
            ],
          },
        ]
      : []),
    ...(selected.includes("data_quality") || selected.includes("decision_speed")
      ? [{ title: "Benefit classification", ids: ["cost_nature"] }]
      : []),
    ...(selected.includes("risk_reduction")
      ? [
          {
            title: "Risk reduction",
            ids: [
              "event_type",
              "aro_before",
              "aro_after",
              ...(riskPath === "direct"
                ? ["loss_per_event"]
                : ["asset_value", "exposure_factor_pct"]),
              "cost_bearer",
            ],
          },
        ]
      : []),
  ];
  const visible = new Set(sections.flatMap((section) => section.ids));
  const byId = new Map(records.map((record) => [record.id, record]));
  function dirty(id?: string) {
    setJson(null);
    setCopyStatus("");
    if (sampleMode) setSampleEdited(true);
    if (id) {
      setIssues((previous) => previous.filter((issue) => issue.field !== id));
      setAsked((previous) =>
        previous.includes(id) ? previous : [...previous, id],
      );
    }
  }
  function valueRecord(id: string, text: string): Input | undefined {
    const previous = byId.get(id);
    if (!text.trim()) return previous?.value === null ? previous : undefined;
    const rule = INPUT_RULES[id];
    if (!rule) return undefined;
    let value: Input["value"] = text;
    if (rule.kind === "number" || rule.kind === "integer") value = Number(text);
    if (rule.kind === "numbers")
      value = text
        .split(",")
        .map((part) => (part.trim() ? Number(part.trim()) : NaN));
    if (rule.kind === "strings")
      value = text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const next: Input = {
      id,
      tier: "estimate",
      origin: "user",
      ...previous,
      ...(previous?.tier === "user_unknown"
        ? ({ tier: "estimate", origin: "user" } as const)
        : {}),
      value,
    };
    if (previous && JSON.stringify(previous.value) !== JSON.stringify(value)) {
      next.origin = "user";
      if (
        ["default", "proxy_accepted", "assistant_accepted"].includes(
          previous.origin,
        ) ||
        previous.tier === "measured"
      )
        next.tier = "estimate";
      if (next.backing)
        next.backing = {
          ...next.backing,
          quote_confirmed: false,
          verified: false,
        };
      if (
        previous.note === DEFAULTS[id]?.note ||
        previous.tier === "user_unknown"
      )
        delete next.note;
    }
    return next;
  }
  function candidate(inputs = records): FormFile {
    const merged = new Map(
      inputs
        .filter((record) => visible.has(record.id))
        .map((record) => [record.id, record]),
    );
    for (const [id, text] of Object.entries(raw))
      if (visible.has(id)) {
        const record = valueRecord(id, text);
        if (record) merged.set(id, record);
        else merged.delete(id);
      }
    return {
      version: 1,
      goals: selected,
      currency,
      horizon_years: horizon.trim() ? Number(horizon) : 0,
      inputs: [...merged.values()],
      file_descriptions: Object.fromEntries(
        files.flatMap((group) =>
          group.files.map((file) => [file.id, group.description]),
        ),
      ),
      other_notes: notes,
      measurement_plan: Object.fromEntries(
        Object.entries(plans).filter(([goal]) =>
          selected.includes(goal as Goal),
        ),
      ),
      asked,
    };
  }
  function replace(record: Input) {
    setRecords((previous) =>
      previous.some((item) => item.id === record.id)
        ? previous.map((item) => (item.id === record.id ? record : item))
        : [...previous, record],
    );
    dirty(record.id);
  }
  function commit(id: string) {
    const form = candidate();
    const relatedAfter: Record<string, string> = {
      minutes_per_task_before: "minutes_per_task_after",
      days_to_decide_before: "days_to_decide_after",
      error_rate_before: "error_rate_after",
      error_count_before: "error_count_after",
      aro_before: "aro_after",
    };
    const errors = validateFormFile(form, context)
      .filter(
        (issue) =>
          (issue.field === id ||
            (issue.code === "AFTER_BEFORE" &&
              issue.field === relatedAfter[id])) &&
          [
            "TYPE",
            "INTEGER",
            "BOUNDS",
            "ADOPTION_LENGTH",
            "AFTER_BEFORE",
            "ENUM",
            "RANGE",
            "UNKNOWN_ID",
          ].includes(issue.code),
      )
      .map((issue) => ({
        ...issue,
        field: id,
        message: `${issue.message} Previous accepted value kept.`,
      }));
    if (errors.length) {
      setIssues((previous) => [
        ...previous.filter((issue) => issue.field !== id),
        ...errors,
      ]);
      setRaw((previous) => ({
        ...previous,
        [id]: pretty(byId.get(id)?.value ?? null),
      }));
      return;
    }
    const next = form.inputs.find((record) => record.id === id);
    setRecords((previous) =>
      next
        ? previous.some((record) => record.id === id)
          ? previous.map((record) => (record.id === id ? next : record))
          : [...previous, next]
        : previous.filter((record) => record.id !== id),
    );
    dirty(id);
  }
  function metadata(id: string, patch: Partial<Input>) {
    replace({
      id,
      value: null,
      tier: "estimate",
      origin: "user",
      ...byId.get(id),
      ...patch,
    });
  }
  function backing(
    id: string,
    key: keyof Backing,
    value: string | number | boolean | undefined,
  ) {
    const next = { ...byId.get(id)?.backing };
    if (value === undefined) delete next[key];
    else Object.assign(next, { [key]: value });
    metadata(id, { backing: next });
  }
  function range(id: string, key: "low" | "high", text: string) {
    const record: Input = {
      id,
      value: null,
      tier: "estimate",
      origin: "user",
      ...byId.get(id),
    };
    if (!text) delete record[key];
    else record[key] = Number(text);
    replace(record);
  }
  function validate(): string | null {
    const form = candidate();
    const errors = validateFormFile(form, context);
    if (errors.length) {
      setIssues(errors);
      setJson(null);
      requestAnimationFrame(() => summary.current?.focus());
      return null;
    }
    const serialized = serializeFormFile(form, context);
    setRecords((previous) => [
      ...previous.filter((record) => !visible.has(record.id)),
      ...form.inputs,
    ]);
    setIssues([]);
    setJson(serialized);
    return serialized;
  }
  function download() {
    const serialized = validate();
    if (!serialized) return;
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      sampleMode && !sampleEdited
        ? "sample-result.form.json"
        : "project.form.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Allow the browser to finish handing the blob to its download service.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function copyJson() {
    const serialized = validate();
    if (!serialized) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setCopyStatus("Copied validated form JSON.");
    } catch {
      setCopyStatus(
        "Clipboard access is unavailable. The JSON preview is selected so you can copy it.",
      );
      requestAnimationFrame(() => {
        document
          .getElementById("validated-output")
          ?.scrollIntoView({ block: "start" });
        const output = document.getElementById("form-json");
        if (output instanceof HTMLTextAreaElement) {
          output.focus();
          output.select();
        }
      });
    }
  }
  function loadSample() {
    const form = parseFormFile(JSON.stringify(sample), sampleContext);
    setSelected(form.goals);
    setCurrency(form.currency);
    setHorizon(String(form.horizon_years));
    acceptedHorizon.current = String(form.horizon_years);
    setRecords(form.inputs);
    setRaw({});
    setNotes(form.other_notes);
    setPlans(form.measurement_plan);
    setAsked(form.asked);
    setFiles([
      {
        id: "sample",
        files: [{ id: "f1", name: "f1 (sample file reference)" }],
        description: form.file_descriptions.f1 ?? "",
      },
    ]);
    setSampleMode(true);
    setSampleEdited(false);
    setCopyStatus("");
    setFileError("");
    setIssues([]);
    setJson(null);
    setTimePath("hours");
    setQualityPath("counts");
    setErrorCostPath("direct");
    setRiskPath("direct");
  }
  function startBlank() {
    setCopyStatus("");
    acceptedHorizon.current = "";
    setSelected([]);
    setCurrency("USD");
    setHorizon("");
    setRecords([]);
    setRaw({});
    setNotes("");
    setPlans({});
    setAsked([]);
    setFiles([]);
    setSampleMode(false);
    setSampleEdited(false);
    setIssues([]);
    setFileError("");
    setJson(null);
    setTimePath("hours");
    setQualityPath("counts");
    setErrorCostPath("direct");
    setRiskPath("direct");
  }
  function field(id: string) {
    const rule = INPUT_RULES[id];
    if (!rule) return null;
    const record = byId.get(id);
    const text = raw[id] ?? pretty(record?.value ?? null);
    const errors = issues.filter((issue) => issue.field === id);
    const b = record?.backing ?? {};
    return (
      <div key={id} className="rounded-xl border bg-card p-4">
        <label
          htmlFor={`value-${id}`}
          className="mb-2 block text-sm font-medium"
        >
          {LABELS[id] ?? id}
        </label>
        {rule.options ? (
          <select
            id={`value-${id}`}
            className={control}
            value={
              rule.kind === "strings"
                ? text
                  ? text.split(",").map((part) => part.trim())
                  : []
                : text
            }
            multiple={rule.kind === "strings"}
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length ? `errors-${id}` : undefined}
            onChange={(event) => {
              const value =
                rule.kind === "strings"
                  ? Array.from(event.target.selectedOptions)
                      .map((option) => option.value)
                      .join(", ")
                  : event.target.value;
              setRaw((previous) => ({ ...previous, [id]: value }));
              dirty(id);
            }}
            onBlur={() => commit(id)}
          >
            <option value="" disabled={rule.kind === "strings"}>
              Choose…
            </option>
            {rule.options.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`value-${id}`}
            className={control}
            value={text}
            inputMode={
              ["number", "integer"].includes(rule.kind) ? "decimal" : undefined
            }
            placeholder={
              id === "adoption_by_year"
                ? "e.g. 50, 80, 90 — one value per year"
                : undefined
            }
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length ? `errors-${id}` : undefined}
            onChange={(event) => {
              setRaw((previous) => ({ ...previous, [id]: event.target.value }));
              dirty(id);
            }}
            onBlur={() => commit(id)}
          />
        )}
        {id === "adoption_by_year" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Comma-separated percentages, one per horizon year. No adoption ramp
            is assumed.
          </p>
        )}
        {id.startsWith("aro_") && (
          <p className="mt-2 text-xs text-muted-foreground">
            Fractions are valid: 0.25 means once in four years.
          </p>
        )}
        {id === "realized_as_cash" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Only documented spending reduction counts as hard savings; freed
            time is capacity.
          </p>
        )}
        {id === "cost_nature" &&
          selected.includes("data_quality") &&
          selected.includes("decision_speed") && (
            <p className="mt-2 text-xs text-muted-foreground">
              This shared classification applies to both data quality and
              decision speed.
            </p>
          )}
        {id.includes("internal_") && (
          <p className="mt-2 text-xs text-muted-foreground">
            Enter the monetary cost. Describe the effort/rate derivation in the
            source note.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            onClick={() => {
              const next: Input = {
                id,
                ...record,
                value: null,
                tier: "user_unknown",
                origin: "user",
                note: "User is not sure; no zero value has been substituted.",
              };
              replace(next);
              setRaw((previous) => ({ ...previous, [id]: "" }));
            }}
          >
            Not sure
          </button>
          {DEFAULTS[id] && (
            <button
              type="button"
              className="text-xs text-primary underline underline-offset-2"
              onClick={() => {
                const next = { id, ...record, ...DEFAULTS[id] } as Input;
                replace(next);
                setRaw((previous) => ({
                  ...previous,
                  [id]: pretty(next.value),
                }));
              }}
            >
              Use labeled proxy: {String(DEFAULTS[id].value)}
            </button>
          )}
        </div>
        {DEFAULTS[id] && (
          <p className="mt-2 text-xs text-muted-foreground">
            Proxy source: {DEFAULTS[id].note}
          </p>
        )}
        {record?.tier === "user_unknown" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Unknown, not zero. Essential costs still need an answer before
            export.
          </p>
        )}
        {rule.role === "cost" && id !== "cost_uplift_pct" && (
          <label className="mt-3 block text-xs">
            Cost basis
            <select
              aria-label={`Cost basis: ${LABELS[id]}`}
              className={`${control} mt-1`}
              value={record?.basis ?? ""}
              onChange={(event) =>
                metadata(id, { basis: event.target.value as Input["basis"] })
              }
            >
              <option value="" disabled>
                Choose a basis
              </option>
              <option value="quoted">Quoted / contracted</option>
              <option value="estimated">Estimated</option>
              <option value="assumed">Assumed</option>
            </select>
          </label>
        )}
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-xs font-medium">
            Source and{" "}
            {rule.role === "effect" ? "supporting evidence" : "notes"}
            {record ? ` · ${record.tier.replaceAll("_", " ")}` : ""}
          </summary>
          <label className="mt-3 block text-xs">
            Where does this figure come from?
            <select
              aria-label={`Source: ${LABELS[id]}`}
              className={`${control} mt-1`}
              value={
                record?.tier === "user_unknown"
                  ? ""
                  : (record?.tier ?? "estimate")
              }
              onChange={(event) =>
                metadata(id, {
                  tier: event.target.value as Input["tier"],
                  origin: event.target.value === "measured" ? "file" : "user",
                })
              }
            >
              <option value="" disabled>
                Unknown
              </option>
              {sourceChoices.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs">
            Source note
            <textarea
              aria-label={`Source note: ${LABELS[id]}`}
              className={`${control} mt-1`}
              value={record?.note ?? ""}
              onChange={(event) => metadata(id, { note: event.target.value })}
            />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-primary"
              checked={record?.vendor_supplied ?? false}
              onChange={(event) =>
                metadata(id, { vendor_supplied: event.target.checked })
              }
            />
            Figure supplied by vendor
          </label>
          {rule.role === "effect" && (
            <div className="mt-3 space-y-3">
              <label className="block text-xs">
                Supporting file
                <select
                  aria-label={`Supporting file: ${LABELS[id]}`}
                  className={`${control} mt-1`}
                  value={b.source_file_id ?? ""}
                  onChange={(event) =>
                    backing(
                      id,
                      "source_file_id",
                      event.target.value || undefined,
                    )
                  }
                >
                  <option value="">No file selected</option>
                  {files
                    .flatMap((group) => group.files)
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs">
                Quoted passage
                <textarea
                  aria-label={`Quoted passage: ${LABELS[id]}`}
                  className={`${control} mt-1`}
                  value={b.quote ?? ""}
                  onChange={(event) =>
                    backing(id, "quote", event.target.value || undefined)
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={b.quote_confirmed ?? false}
                  onChange={(event) =>
                    backing(id, "quote_confirmed", event.target.checked)
                  }
                />
                I confirm this passage
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["low", "Low value"],
                    ["high", "High value"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-xs">
                    {label}
                    <input
                      aria-label={`${label}: ${LABELS[id]}`}
                      type="number"
                      step="any"
                      className={`${control} mt-1`}
                      value={record?.[key] ?? ""}
                      onChange={(event) => range(id, key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              {(
                [
                  ["second_source_value", "Second independent value"],
                  ["observations", "Number of observations"],
                  ["period_months", "Months covered"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs">
                  {label}
                  <input
                    aria-label={`${label}: ${LABELS[id]}`}
                    type="number"
                    min={0}
                    step={key === "observations" ? 1 : "any"}
                    className={`${control} mt-1`}
                    value={b[key] ?? ""}
                    onChange={(event) =>
                      backing(
                        id,
                        key,
                        event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      )
                    }
                  />
                </label>
              ))}
              <label className="block text-xs">
                Second source description
                <input
                  aria-label={`Second source description: ${LABELS[id]}`}
                  className={`${control} mt-1`}
                  value={b.second_source_note ?? ""}
                  onChange={(event) =>
                    backing(
                      id,
                      "second_source_note",
                      event.target.value || undefined,
                    )
                  }
                />
              </label>
              <label className="block text-xs">
                Source date
                <input
                  aria-label={`Source date: ${LABELS[id]}`}
                  type="date"
                  className={`${control} mt-1`}
                  value={b.source_date ?? ""}
                  onChange={(event) =>
                    backing(id, "source_date", event.target.value || undefined)
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={b.verified ?? false}
                  onChange={(event) =>
                    backing(id, "verified", event.target.checked)
                  }
                />
                Reviewed by a data owner
              </label>
              <label className="block text-xs">
                Reviewer name
                <input
                  aria-label={`Reviewer name: ${LABELS[id]}`}
                  className={`${control} mt-1`}
                  value={b.verified_by ?? ""}
                  onChange={(event) =>
                    backing(id, "verified_by", event.target.value || undefined)
                  }
                />
              </label>
            </div>
          )}
        </details>
        {errors.length > 0 && (
          <ul
            id={`errors-${id}`}
            className="mt-3 space-y-1 text-xs text-destructive"
          >
            {errors.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <main
      className="h-full scroll-pt-32 overflow-y-auto bg-background p-4 sm:p-8"
      aria-label="Project intake"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Target className="size-5 text-primary" />
            ValueIQ
          </Link>
          <span className="rounded-full border px-3 py-1 text-xs">
            {sampleMode
              ? sampleEdited
                ? "Edited sample · local draft"
                : "Sample data · local draft"
              : "Local draft · not saved"}
          </span>
        </header>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Intake / Structured form
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Build your project case
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Choose outcomes, record the facts, and attach the evidence behind
              them. Download the validated form for assessment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={action} onClick={startBlank}>
              Start blank draft
            </button>
            <button type="button" className={action} onClick={loadSample}>
              Load Eli’s sample
            </button>
          </div>
        </div>
        <p className="mb-6 rounded-xl border bg-muted/50 p-4 text-sm">
          This editor exports a local JSON file. It does not save a project,
          upload files, run the assistant, or calculate results.{" "}
          {sampleMode && "Sample file references are for testing only."}
        </p>
        <div className="sticky top-0 z-10 mb-5 flex flex-wrap gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <button
            type="button"
            className={action}
            onClick={() => {
              if (validate())
                requestAnimationFrame(() =>
                  document
                    .getElementById("validated-output")
                    ?.scrollIntoView({ block: "start" }),
                );
            }}
          >
            Preview JSON
          </button>
          <button
            type="button"
            className={action}
            onClick={() => {
              void copyJson();
            }}
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={download}
          >
            <Download className="size-4" />
            Download form JSON
          </button>
        </div>
        {copyStatus && (
          <p role="status" className="mb-4 text-sm text-primary">
            {copyStatus}
          </p>
        )}
        {issues.length > 0 && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="mb-6 rounded-xl border border-destructive p-4 outline-none"
          >
            <h2 className="font-medium">
              Check these answers before exporting
            </h2>
            <ul className="mt-2 list-inside list-disc text-sm">
              {issues.map((issue, index) => (
                <li key={index}>
                  {LABELS[issue.field] ?? issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <section
          className="mb-5 rounded-xl border bg-card p-5"
          aria-label="Project setup"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Currency
              <input
                aria-label="Currency"
                className={`${control} mt-2`}
                value={currency}
                maxLength={3}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  dirty("currency");
                }}
              />
            </label>
            <div>
              <label htmlFor="horizon" className="block text-sm font-medium">
                Years to evaluate
              </label>
              <input
                id="horizon"
                className={`${control} mt-2`}
                value={horizon}
                inputMode="numeric"
                onBlur={() => {
                  const value = Number(horizon);
                  if (
                    !horizon.trim() ||
                    !Number.isInteger(value) ||
                    value < 1 ||
                    value > 20
                  ) {
                    setIssues((previous) => [
                      ...previous.filter(
                        (issue) => issue.field !== "horizon_years",
                      ),
                      {
                        code: "HORIZON",
                        field: "horizon_years",
                        message:
                          "Use an integer from 1 to 20; the previous accepted horizon was kept.",
                      },
                    ]);
                    setHorizon(acceptedHorizon.current);
                  } else acceptedHorizon.current = horizon;
                }}
                onChange={(event) => {
                  setHorizon(event.target.value);
                  dirty("horizon_years");
                }}
              />
              <button
                type="button"
                className="mt-1 text-xs underline"
                onClick={() => {
                  setHorizon("3");
                  acceptedHorizon.current = "3";
                  dirty("horizon_years");
                }}
              >
                Use 3 years · team assumption
              </button>
            </div>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">
              Goals · select all that apply
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.entries(GOAL_LABELS) as [Goal, string][]).map(
                ([goal, label]) => (
                  <label
                    key={goal}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${selected.includes(goal) ? "border-primary bg-accent" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selected.includes(goal)}
                      onChange={(event) => {
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, goal]
                            : previous.filter((value) => value !== goal),
                        );
                        dirty("goals");
                      }}
                    />
                    {label}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        </section>
        <section
          className="mb-5 rounded-xl border bg-card p-5"
          aria-labelledby="files-heading"
        >
          <h2 id="files-heading" className="font-semibold">
            Source files
          </h2>
          <p className="my-2 text-xs text-muted-foreground">
            Local references only, not uploaded. Each file group needs a
            description. Up to 10 files, 10 MB each. Files must be uploaded
            before a connected assessment can read them.
          </p>
          <label
            className={`${action} inline-flex cursor-pointer items-center gap-2`}
          >
            <Plus className="size-4" />
            Add file group
            <input
              aria-label="Add file group"
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (!picked.length) return;
                if (
                  files.flatMap((group) => group.files).length + picked.length >
                    10 ||
                  picked.some(
                    (file) => !file.size || file.size > 10 * 1024 * 1024,
                  )
                ) {
                  setFileError(
                    "Select non-empty files up to 10 MB each, 10 files total. Previous selections were kept.",
                  );
                  return;
                }
                setFiles((previous) => [
                  ...previous,
                  {
                    id: crypto.randomUUID(),
                    files: picked.map((file) => ({
                      id: `local-${crypto.randomUUID()}`,
                      name: file.name,
                    })),
                    description: "",
                  },
                ]);
                setFileError("");
                dirty();
              }}
            />
          </label>
          {fileError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {fileError}
            </p>
          )}
          {files.map((group, index) => (
            <div key={group.id} className="mt-4 rounded-lg border p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <ul className="min-w-0 text-sm">
                  {group.files.map((file) => (
                    <li key={file.id} className="flex gap-2 break-all">
                      <FileText className="mt-0.5 size-4 shrink-0" />
                      {file.name}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={action}
                  aria-label={`Remove file group ${index + 1}`}
                  onClick={() => {
                    setFiles((previous) =>
                      previous.filter((file) => file.id !== group.id),
                    );
                    dirty();
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <label className="text-xs">
                Group {index + 1} description (required)
                <textarea
                  aria-label={`Group ${index + 1} description`}
                  className={`${control} mt-1`}
                  value={group.description}
                  onChange={(event) => {
                    setFiles((previous) =>
                      previous.map((file) =>
                        file.id === group.id
                          ? { ...file, description: event.target.value }
                          : file,
                      ),
                    );
                    dirty("file_descriptions");
                  }}
                />
              </label>
            </div>
          ))}
        </section>
        {selected.includes("time_savings") && (
          <label className="mb-4 block text-sm">
            Time-saving input method
            <select
              aria-label="Time-saving input method"
              className={`${control} mt-1 max-w-md`}
              value={timePath}
              onChange={(event) => {
                setTimePath(event.target.value);
                dirty();
              }}
            >
              <option value="hours">Hours saved per person per week</option>
              <option value="tasks">
                Task minutes before/after and task frequency
              </option>
            </select>
          </label>
        )}
        {selected.includes("data_quality") && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Error input method
              <select
                aria-label="Error input method"
                className={`${control} mt-1`}
                value={qualityPath}
                onChange={(event) => {
                  setQualityPath(event.target.value);
                  dirty();
                }}
              >
                <option value="counts">Annual error counts</option>
                <option value="rates">Annual volume and error rates</option>
              </select>
            </label>
            <label className="text-sm">
              Error cost method
              <select
                aria-label="Error cost method"
                className={`${control} mt-1`}
                value={errorCostPath}
                onChange={(event) => {
                  setErrorCostPath(event.target.value);
                  dirty();
                }}
              >
                <option value="direct">Cost per error</option>
                <option value="derived">Clean-unit cost and multiplier</option>
              </select>
            </label>
          </div>
        )}
        {selected.includes("risk_reduction") && (
          <label className="mb-4 block text-sm">
            Loss input method
            <select
              aria-label="Loss input method"
              className={`${control} mt-1 max-w-md`}
              value={riskPath}
              onChange={(event) => {
                setRiskPath(event.target.value);
                dirty();
              }}
            >
              <option value="direct">Loss per event</option>
              <option value="asset">Asset value and exposure</option>
            </select>
          </label>
        )}
        {sections.map((section) => (
          <section
            key={section.title}
            aria-label={section.title}
            className="mb-6"
          >
            <h2 className="mb-3 text-lg font-semibold">{section.title}</h2>
            <div className="grid items-start gap-3 md:grid-cols-2">
              {section.ids.map(field)}
            </div>
          </section>
        ))}
        <section className="mb-6 rounded-xl border bg-card p-5">
          <label htmlFor="other-notes" className="text-sm font-medium">
            Anything relevant we did not ask?
          </label>
          <textarea
            id="other-notes"
            className={`${control} mt-2`}
            rows={3}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              dirty("other_notes");
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Notes provide context; they do not change numeric values
            automatically.
          </p>
        </section>
        {selected.map((goal) => (
          <details key={goal} className="mb-3 rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Measurement plan · {GOAL_LABELS[goal]}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["metric", "How will you measure this outcome?"],
                  ["baseline", "Baseline"],
                  ["baseline_source", "Baseline source"],
                  ["owner", "Measurement owner"],
                  ["frequency", "How often?"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs">
                  {label}
                  <input
                    aria-label={`${label}: ${GOAL_LABELS[goal]}`}
                    className={`${control} mt-1`}
                    value={plans[goal]?.[key] ?? ""}
                    onChange={(event) => {
                      setPlans((previous) => ({
                        ...previous,
                        [goal]: {
                          metric: "",
                          baseline: "",
                          baseline_source: "",
                          owner: "",
                          frequency: "",
                          ...previous[goal],
                          [key]: event.target.value,
                        },
                      }));
                      dirty();
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
        ))}
        {json && (
          <section
            id="validated-output"
            className="mb-6 rounded-xl border bg-card p-5"
            aria-label="Validated JSON"
          >
            <h2 className="font-semibold">Validated form output</h2>
            <p role="status" className="my-2 text-sm text-muted-foreground">
              Form validation passed. Calculation and confidence checks belong
              to the assessment engine.
            </p>
            <textarea
              id="form-json"
              aria-label="Validated form JSON"
              className="max-h-96 w-full overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs"
              rows={16}
              value={json}
              readOnly
            />
          </section>
        )}
        <p className="pb-6 text-xs text-muted-foreground">
          Draft answers stay in this tab and clear when you leave or refresh.
        </p>
      </div>
    </main>
  );
}
