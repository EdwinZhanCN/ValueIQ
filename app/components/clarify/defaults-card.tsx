import { Check } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TIER_LABELS, unitFor } from "./draft";
import { TierBadge } from "./field-editor";
import { labelOf, valueOf } from "./progress";
import { CollapsedRow, QuestionHeader } from "./question-card";
import type { FormDraft } from "./use-form-draft";

/**
 * First Clarify question: accept the labeled defaults (the team's discount
 * rate and recapture, built-in values for the rest) for the fields that have
 * one, or enter your own value in that field's card.
 */
export function DefaultsCard({
  draft,
  ids,
  declined,
  open,
  onOpen,
  onDecline,
  onDone,
}: {
  draft: FormDraft;
  ids: string[];
  declined: ReadonlySet<string>;
  open: boolean;
  onOpen: () => void;
  onDecline: (id: string) => void;
  onDone: () => void;
}) {
  const pending = ids.filter((id) => !draft.byId.get(id) && !declined.has(id));
  const used = ids.filter((id) =>
    ["default", "proxy_accepted"].includes(draft.byId.get(id)?.origin ?? ""),
  );
  if (!open)
    return (
      <CollapsedRow
        title="Defaults"
        summary={
          pending.length
            ? `${pending.length} to decide`
            : `${used.length} of ${ids.length} used`
        }
        complete={!pending.length}
        onEdit={onOpen}
      />
    );
  return (
    <article
      aria-labelledby="defaults-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
    >
      <QuestionHeader id="defaults-heading" title="Use the defaults?">
        {pending.length > 1 && (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              for (const id of pending) draft.acceptProxy(id);
              onDone();
            }}
          >
            Use all
          </Button>
        )}
      </QuestionHeader>
      <ul className="flex flex-col divide-y rounded-xl border">
        {ids.map((id) => {
          const proxy = draft.defaults[id]!;
          const record = draft.byId.get(id);
          const unit = unitFor(id, draft.currency);
          return (
            <li
              key={id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3"
            >
              <div className="min-w-0 flex-[1_1_14rem]">
                <p className="text-sm font-medium">{labelOf(id)}</p>
                <p className="text-xs text-muted-foreground">
                  {proxy.team
                    ? (proxy.team.rationale ?? proxy.team.source)
                    : proxy.note}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {String(proxy.value)}
                  {unit === "%" ? "%" : ""}
                </span>
                {unit && unit !== "%" && (
                  <span className="text-xs text-muted-foreground">{unit}</span>
                )}
                {proxy.team ? (
                  <Badge data-testid="team-default">Team default</Badge>
                ) : (
                  <Badge variant="secondary">{TIER_LABELS[proxy.tier]}</Badge>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {record ? (
                  <>
                    <span className="text-sm">{valueOf(draft, id) ?? "—"}</span>
                    <TierBadge record={record} />
                  </>
                ) : declined.has(id) ? (
                  <span className="text-xs text-muted-foreground">
                    Your value, later
                  </span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => draft.acceptProxy(id)}
                      aria-label={`Use default: ${labelOf(id)}`}
                    >
                      <Check />
                      Use
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDecline(id)}
                      aria-label={`Enter my own: ${labelOf(id)}`}
                    >
                      My own
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <Button className="h-10 rounded-full px-4" onClick={onDone}>
          <Check />
          Confirm
        </Button>
      </div>
    </article>
  );
}
