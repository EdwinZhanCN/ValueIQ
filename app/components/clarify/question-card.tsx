import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { control, FieldEditor } from "./field-editor";
import type { Paths } from "./draft";
import type { Group } from "./progress";
import type { FormDraft } from "./use-form-draft";

export function QuestionHeader({
  id,
  title,
  counter,
  children,
}: {
  id: string;
  title: string;
  counter?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 id={id} className="flex-1 text-lg leading-snug font-semibold">
        {title}
      </h2>
      {counter && (
        <span className="text-[0.8rem] text-muted-foreground">{counter}</span>
      )}
      {children}
    </div>
  );
}

/** An answered or later question, folded to one line. */
export function CollapsedRow({
  title,
  summary,
  complete,
  onEdit,
}: {
  title: string;
  summary: string;
  complete: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-sm">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5.5 flex-none items-center justify-center rounded-full",
          complete
            ? "bg-accent text-primary"
            : "border-[1.5px] border-border text-muted-foreground",
        )}
      >
        {complete && <Check className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{title}</span>{" "}
        <span className="text-muted-foreground">· {summary}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-primary"
        onClick={onEdit}
        aria-label={`${complete ? "Edit" : "Open"}: ${title}`}
      >
        {complete ? "Edit" : "Open"}
      </Button>
    </div>
  );
}

type Method = {
  [K in keyof Paths]: {
    key: K;
    label: string;
    options: [Paths[K], string][];
  };
}[keyof Paths];

const METHODS: Partial<Record<Group["key"], Method[]>> = {
  time_savings: [
    {
      key: "time",
      label: "Time-saving input method",
      options: [
        ["hours", "Hours saved"],
        ["tasks", "Task minutes"],
      ],
    },
  ],
  data_quality: [
    {
      key: "quality",
      label: "Error input method",
      options: [
        ["counts", "Error counts"],
        ["rates", "Volume and rates"],
      ],
    },
    {
      key: "errorCost",
      label: "Error cost method",
      options: [
        ["direct", "Cost per error"],
        ["derived", "Clean-unit cost × multiplier"],
      ],
    },
  ],
  risk_reduction: [
    {
      key: "risk",
      label: "Loss input method",
      options: [
        ["direct", "Loss per event"],
        ["asset", "Asset value × exposure"],
      ],
    },
  ],
};

function MethodToggle({ method, draft }: { method: Method; draft: FormDraft }) {
  return (
    <div
      role="radiogroup"
      aria-label={method.label}
      className="inline-flex flex-wrap rounded-full border p-0.5 text-[0.8rem]"
    >
      {method.options.map(([value, label]) => {
        const checked = draft.paths[method.key] === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            className={cn(
              "rounded-full px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              checked
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => draft.setPath(method.key, value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SettingTile({ id, draft }: { id: string; draft: FormDraft }) {
  const errors = draft.issues.filter((issue) => issue.field === id);
  const currency = id === "currency";
  return (
    <div
      id={`field-${id}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-2 rounded-xl border bg-card p-3",
        errors.length > 0 && "border-destructive bg-destructive/5",
      )}
    >
      <label
        htmlFor={`value-${id}`}
        className="text-[0.8rem] text-muted-foreground"
      >
        {currency ? "Currency" : "Years to evaluate"}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`value-${id}`}
          className={cn(control, "text-base font-semibold")}
          value={currency ? draft.currency : draft.horizon}
          maxLength={currency ? 3 : undefined}
          inputMode={currency ? undefined : "numeric"}
          placeholder={currency ? "USD" : "3"}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length ? `errors-${id}` : undefined}
          onChange={(event) =>
            currency
              ? draft.setCurrency(event.target.value.toUpperCase())
              : draft.setHorizon(event.target.value)
          }
          onBlur={currency ? undefined : draft.commitHorizon}
        />
        {!currency && (
          <span className="shrink-0 text-xs text-muted-foreground">years</span>
        )}
      </div>
      {errors.length > 0 && (
        <ul id={`errors-${id}`} className="space-y-1 text-xs text-destructive">
          {errors.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      )}
      {!currency && (
        <button
          type="button"
          className="self-start text-xs text-primary underline underline-offset-2"
          onClick={draft.acceptHorizonDefault}
        >
          Use 3 years · team assumption
        </button>
      )}
    </div>
  );
}

/** The open question: one group of fields as tiles, then Confirm. */
export function QuestionCard({
  group,
  counter,
  draft,
  onConfirm,
  onNotSure,
}: {
  group: Group;
  counter: string;
  draft: FormDraft;
  onConfirm: () => void;
  onNotSure: () => void;
}) {
  const headingId = `question-${group.key}`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border bg-card p-5"
      id={`card-${group.key}`}
    >
      <QuestionHeader id={headingId} title={group.question} counter={counter} />
      {METHODS[group.key] && (
        <div className="flex flex-wrap gap-2">
          {METHODS[group.key]!.map((method) => (
            <MethodToggle key={method.key} method={method} draft={draft} />
          ))}
        </div>
      )}
      <div className="grid items-start gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr))]">
        {group.fields.map((id) =>
          id === "currency" || id === "horizon_years" ? (
            <SettingTile key={id} id={id} draft={draft} />
          ) : (
            <FieldEditor key={id} id={id} draft={draft} />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="h-10 rounded-full px-4" onClick={onConfirm}>
          <Check />
          Confirm
        </Button>
        {group.gaps.some(
          (id) => id !== "currency" && id !== "horizon_years",
        ) && (
          <Button
            variant="outline"
            className="h-10 rounded-full px-4"
            onClick={onNotSure}
          >
            Not sure about the rest
          </Button>
        )}
      </div>
    </article>
  );
}
