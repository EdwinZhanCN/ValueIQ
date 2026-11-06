import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { Input } from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { DEFAULTS, LABELS } from "../../lib/intake-fields";
import { OPTIONAL, SOURCE_CHOICES, TIER_LABELS, unitFor } from "./draft";
import type { FormDraft } from "./use-form-draft";

export const control =
  "block w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const HINTS: Record<string, string> = {
  adoption_by_year: "One % per year, comma-separated. No ramp is assumed.",
  aro_before: "Fractions are valid: 0.25 is once in four years.",
  aro_after: "Fractions are valid: 0.25 is once in four years.",
  realized_as_cash:
    "Only documented spending reduction counts; freed time is capacity.",
  cost_one_time_internal_labor:
    "Monetary cost. Put the effort and rate in the source note.",
  cost_annual_internal_support:
    "Monetary cost. Put the effort and rate in the source note.",
};

/** Evidence tier of a record, marked when it came from a proxy. */
export function TierBadge({ record }: { record: Input }) {
  const proxy = ["default", "proxy_accepted"].includes(record.origin);
  return (
    <Badge
      variant={record.tier === "user_unknown" ? "outline" : "secondary"}
      className={cn(
        record.tier === "measured" && "bg-accent text-accent-foreground",
      )}
    >
      {TIER_LABELS[record.tier]}
      {proxy ? " · proxy" : ""}
    </Badge>
  );
}

/**
 * One form field as a tile: the value with its unit, the evidence tier, the
 * "Not sure" and labeled-proxy options, the cost basis, and the source and
 * supporting evidence behind the figure.
 */
export function FieldEditor({ id, draft }: { id: string; draft: FormDraft }) {
  const rule = INPUT_RULES[id];
  if (!rule) return null;
  const record = draft.byId.get(id);
  const text = draft.text(id);
  const errors = draft.issues.filter((issue) => issue.field === id);
  const b = record?.backing ?? {};
  const label = LABELS[id] ?? id;
  const unit = unitFor(id, draft.currency);
  const proxy = DEFAULTS[id];
  const fileName = new Map(draft.files.map((file) => [file.id, file.name]));
  const describedBy = errors.length ? `errors-${id}` : undefined;
  return (
    <div
      id={`field-${id}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-2 rounded-xl border bg-card p-3",
        errors.length > 0 && "border-destructive bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label
          htmlFor={`value-${id}`}
          className="text-[0.8rem] leading-snug text-muted-foreground"
        >
          {label}
          {OPTIONAL.has(id) && <span className="ml-1">· optional</span>}
        </label>
        {record && <TierBadge record={record} />}
      </div>
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
          aria-describedby={describedBy}
          onChange={(event) =>
            draft.type(
              id,
              rule.kind === "strings"
                ? Array.from(event.target.selectedOptions)
                    .map((option) => option.value)
                    .join(", ")
                : event.target.value,
            )
          }
          onBlur={() => draft.commit(id)}
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
        <div className="flex items-center gap-2">
          <input
            id={`value-${id}`}
            className={cn(
              control,
              rule.kind !== "text" && "text-base font-semibold",
            )}
            value={text}
            inputMode={
              ["number", "integer"].includes(rule.kind) ? "decimal" : undefined
            }
            placeholder={
              record?.tier === "user_unknown"
                ? "Not sure"
                : id === "adoption_by_year"
                  ? "50, 80, 90"
                  : undefined
            }
            aria-invalid={errors.length > 0}
            aria-describedby={describedBy}
            onChange={(event) => draft.type(id, event.target.value)}
            onBlur={() => draft.commit(id)}
          />
          {unit && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      )}
      {HINTS[id] && (
        <p className="text-xs text-muted-foreground">{HINTS[id]}</p>
      )}
      {id === "cost_nature" &&
        draft.goals.includes("data_quality") &&
        draft.goals.includes("decision_speed") && (
          <p className="text-xs text-muted-foreground">
            Applies to both data quality and decision speed.
          </p>
        )}
      {errors.length > 0 && (
        <ul id={`errors-${id}`} className="space-y-1 text-xs text-destructive">
          {errors.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button
          type="button"
          className="text-xs underline underline-offset-2"
          aria-pressed={record?.tier === "user_unknown"}
          onClick={() => draft.notSure(id)}
        >
          Not sure
        </button>
        {proxy && (
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2"
            title={proxy.note}
            onClick={() => draft.acceptProxy(id)}
          >
            Use proxy: {String(proxy.value)}
            {unit === "%" ? "%" : ""}
          </button>
        )}
      </div>
      {record?.tier === "user_unknown" && (
        <p className="text-xs text-muted-foreground">
          Unknown, not zero.
          {rule.role === "effect" ? " Left out of the numbers." : ""}
        </p>
      )}
      {rule.role === "cost" && id !== "cost_uplift_pct" && (
        <label className="block text-xs">
          Cost basis
          <select
            aria-label={`Cost basis: ${label}`}
            className={cn(control, "mt-1")}
            value={record?.basis ?? ""}
            onChange={(event) =>
              draft.metadata(id, {
                basis: event.target.value as Input["basis"],
              })
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
      <details className="border-t pt-2">
        <summary className="cursor-pointer text-xs font-medium">
          {rule.role === "effect" ? "Source and evidence" : "Source"}
        </summary>
        <label className="mt-3 block text-xs">
          Where does this figure come from?
          <select
            aria-label={`Source: ${label}`}
            className={cn(control, "mt-1")}
            value={
              record?.tier === "user_unknown"
                ? ""
                : (record?.tier ?? "estimate")
            }
            onChange={(event) =>
              draft.metadata(id, {
                tier: event.target.value as Input["tier"],
                origin: event.target.value === "measured" ? "file" : "user",
              })
            }
          >
            <option value="" disabled>
              Unknown
            </option>
            {SOURCE_CHOICES.map(([value, choice]) => (
              <option key={value} value={value}>
                {choice}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs">
          Source note
          <textarea
            aria-label={`Source note: ${label}`}
            className={cn(control, "mt-1")}
            value={record?.note ?? ""}
            onChange={(event) =>
              draft.metadata(id, { note: event.target.value })
            }
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={record?.vendor_supplied ?? false}
            onChange={(event) =>
              draft.metadata(id, { vendor_supplied: event.target.checked })
            }
          />
          Figure supplied by vendor
        </label>
        {rule.role === "effect" && (
          <div className="mt-3 space-y-3">
            <label className="block text-xs">
              Supporting file
              <select
                aria-label={`Supporting file: ${label}`}
                className={cn(control, "mt-1")}
                value={b.source_file_id ?? ""}
                onChange={(event) =>
                  draft.backing(
                    id,
                    "source_file_id",
                    event.target.value || undefined,
                  )
                }
              >
                <option value="">No file selected</option>
                {Object.keys(draft.fileNotes).map((fileId) => (
                  <option key={fileId} value={fileId}>
                    {fileName.get(fileId) ?? fileId}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Quoted passage
              <textarea
                aria-label={`Quoted passage: ${label}`}
                className={cn(control, "mt-1")}
                value={b.quote ?? ""}
                onChange={(event) =>
                  draft.backing(id, "quote", event.target.value || undefined)
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-primary"
                checked={b.quote_confirmed ?? false}
                onChange={(event) =>
                  draft.backing(id, "quote_confirmed", event.target.checked)
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
              ).map(([key, name]) => (
                <label key={key} className="text-xs">
                  {name}
                  <input
                    aria-label={`${name}: ${label}`}
                    type="number"
                    step="any"
                    className={cn(control, "mt-1")}
                    value={record?.[key] ?? ""}
                    onChange={(event) =>
                      draft.range(id, key, event.target.value)
                    }
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
            ).map(([key, name]) => (
              <label key={key} className="block text-xs">
                {name}
                <input
                  aria-label={`${name}: ${label}`}
                  type="number"
                  min={0}
                  step={key === "observations" ? 1 : "any"}
                  className={cn(control, "mt-1")}
                  value={b[key] ?? ""}
                  onChange={(event) =>
                    draft.backing(
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
                aria-label={`Second source description: ${label}`}
                className={cn(control, "mt-1")}
                value={b.second_source_note ?? ""}
                onChange={(event) =>
                  draft.backing(
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
                aria-label={`Source date: ${label}`}
                type="date"
                className={cn(control, "mt-1")}
                value={b.source_date ?? ""}
                onChange={(event) =>
                  draft.backing(
                    id,
                    "source_date",
                    event.target.value || undefined,
                  )
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-primary"
                checked={b.verified ?? false}
                onChange={(event) =>
                  draft.backing(id, "verified", event.target.checked)
                }
              />
              Reviewed by a data owner
            </label>
            <label className="block text-xs">
              Reviewer name
              <input
                aria-label={`Reviewer name: ${label}`}
                className={cn(control, "mt-1")}
                value={b.verified_by ?? ""}
                onChange={(event) =>
                  draft.backing(
                    id,
                    "verified_by",
                    event.target.value || undefined,
                  )
                }
              />
            </label>
          </div>
        )}
      </details>
    </div>
  );
}
