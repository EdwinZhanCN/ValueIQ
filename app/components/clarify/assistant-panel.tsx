import { useAgent } from "agents/react";
import { ArrowRight, Check, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type {
  AppliedInput,
  AssistantCard,
  AssistantProposal,
  AssistantReply,
  AssistantTurn,
  RunView,
} from "../../../shared/types";
import type { FormIssue } from "../../../shared/form";
import { pretty } from "./draft";
import { labelOf } from "./progress";
import type { FormDraft } from "./use-form-draft";

type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

type Preflight = { passed: boolean; cancelled: boolean; message: string };

export type AssistantAvailability = {
  available: boolean;
  scripted: boolean;
  reason: string | null;
};

type Line =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; notices: string[] }
  | { role: "error"; text: string };

type Props = {
  draft: FormDraft;
  problems: FormIssue[];
  /** Defaults this page offers (visible fields with a labeled default). */
  offered: readonly string[];
  availability: AssistantAvailability;
  /** Open and focus the question card for an input. */
  onReveal: (id: string) => void;
  /** Something was accepted: save soon. */
  onAccepted: () => void;
  onContinue: () => void;
  /** This is the preparation turn right after Intake. */
  prep?: boolean;
  /** The first reply has arrived (or failed), so the loading page can end. */
  onPrepDone?: () => void;
};

/**
 * The Clarify assistant (item 7): a conversation kept only on this page.
 * Every card and suggestion is advice; the form changes only when the user
 * accepts one, through the same draft methods the question cards use.
 */
export function AssistantPanel(props: Props) {
  if (!props.availability.available)
    return (
      <div className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
        <p className="font-medium">Assistant unavailable</p>
        <p className="text-[0.8rem] text-muted-foreground">
          {props.availability.reason}
        </p>
      </div>
    );
  return <ConnectedAssistant {...props} />;
}

function ConnectedAssistant({
  draft,
  problems,
  offered,
  availability,
  onReveal,
  onAccepted,
  onContinue,
  prep,
  onPrepDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const agent = useAgent<RunView>({
    agent: "ValueIQAgent",
    name: draft.projectId,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [cards, setCards] = useState<AssistantCard[]>([]);
  const [proposals, setProposals] = useState<AssistantProposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Preflight | "busy" | null>(null);
  const [filled, setFilled] = useState<AppliedInput[]>([]);
  const opened = useRef(false);
  const pendingCheck = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(text: string, prepRun = false) {
    const history: AssistantTurn[] = lines
      .filter((l) => l.role !== "error")
      .map((l) => ({ role: l.role, text: l.text }));
    if (text) setLines((previous) => [...previous, { role: "user", text }]);
    setBusy(true);
    let reply: CallResult<AssistantReply>;
    try {
      reply = await agent.call<CallResult<AssistantReply>>(
        "chat",
        [text, history, draft.candidate(), { prep: prepRun }],
        { timeout: 90_000 },
      );
    } catch {
      reply = {
        ok: false,
        error: { code: "NETWORK", message: "The assistant did not answer." },
      };
    }
    setBusy(false);
    if (!reply.ok) {
      onPrepDone?.();
      setLines((previous) => [
        ...previous,
        {
          role: "error",
          text:
            reply.error.code === "NO_MODEL"
              ? `Assistant unavailable: ${reply.error.message}`
              : reply.error.message,
        },
      ]);
      return;
    }
    const value = reply.value;
    setLines((previous) => [
      ...previous,
      { role: "assistant", text: value.text, notices: value.notices },
    ]);
    // A reply replaces the cards of the kinds it carries; others stay.
    const kinds = new Set(value.cards.map((c) => c.kind));
    setCards((previous) => [
      ...previous.filter((c) => !kinds.has(c.kind)),
      ...value.cards,
    ]);
    setProposals(value.proposals);
    // Values the agent filled in itself: code already chose each tier and origin.
    const applied = (value.applied ?? []).filter((a) =>
      draft.applyAgentValue(a),
    );
    if (applied.length) {
      setFilled((previous) => [...previous, ...applied]);
      onAccepted();
    }
    onPrepDone?.();
  }

  // The opening turn: defaults first, then what is missing.
  useEffect(() => {
    if (!open || opened.current) return;
    opened.current = true;
    void send("", prep === true);
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, busy]);

  async function runCheck() {
    setCheck("busy");
    try {
      const r = await agent.call<CallResult<Preflight>>("preflight", [], {
        timeout: 90_000,
      });
      setCheck(
        r.ok
          ? r.value
          : { passed: false, cancelled: false, message: r.error.message },
      );
    } catch {
      setCheck({
        passed: false,
        cancelled: false,
        message: "The check did not answer.",
      });
    }
  }

  // The check reads the saved form, so unsaved edits are saved first.
  useEffect(() => {
    if (!pendingCheck.current || draft.saving || !draft.saved?.saved) return;
    pendingCheck.current = false;
    void runCheck();
  }, [draft.saving, draft.saved]);

  function checkInputs() {
    if (draft.unsaved) {
      pendingCheck.current = true;
      setCheck("busy");
      draft.save();
    } else void runCheck();
  }

  const missing = new Set(problems.map((p) => p.field));
  const answered = (id: string) => draft.byId.has(id);
  const offeredSet = new Set(offered);
  const shown = cards
    .map((card) => {
      if (card.kind === "defaults")
        return {
          ...card,
          fields: card.fields.filter(
            (id) => offeredSet.has(id) && !answered(id),
          ),
        };
      if (card.kind === "missing")
        return { ...card, fields: card.fields.filter((id) => missing.has(id)) };
      const e = card.evidence;
      const b = e ? draft.byId.get(e.input_id)?.backing : undefined;
      return b?.quote === e?.quote ? { ...card, fields: [] } : card;
    })
    .filter((card) => card.fields.length > 0);

  function accept(run: () => void, id: string) {
    run();
    onReveal(id);
    onAccepted();
  }

  const ready = problems.length === 0;
  return (
    <section
      aria-label="Assistant"
      className="flex flex-col gap-3 rounded-2xl border-2 border-primary/60 bg-primary/5 p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1" data-testid="assistant-intro">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            AI assistant
          </span>
          <h2 className="text-base font-semibold">
            Your estimate helper, working on the cards below
          </h2>
          {availability.scripted && <Badge variant="destructive">STUB</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          It reads your descriptions and files, then fills in the inputs below
          for you. Everything it fills is labeled &quot;AI estimate&quot; (or by
          its source) and counts toward your estimate right away. You can ask it
          to make changes, estimate what is missing, or explain any field, and
          you can edit or undo anything it wrote. It never does the math; the
          Process step does.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            "Estimate everything that is still missing",
            "What do I still need to answer?",
            "Explain the fields I am unsure about",
          ].map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              size="sm"
              variant="outline"
              disabled={!open || busy}
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!open || check === "busy"}
          onClick={checkInputs}
        >
          {check === "busy" && <Spinner className="size-3.5" />}
          Check my inputs
        </Button>
      </div>
      {check && check !== "busy" && (
        <div
          role="status"
          data-testid="assistant-check"
          className={cn(
            "rounded-lg border p-2.5 text-[0.8rem]",
            ready ? "border-primary/40" : "border-destructive/40",
          )}
        >
          <p className="font-medium">
            {ready ? "Ready for Process" : `${missing.size} still needed`}
          </p>
          {check.message && (
            <p className="text-muted-foreground">{check.message}</p>
          )}
        </div>
      )}

      <div
        aria-label="Conversation"
        aria-live="polite"
        className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] rounded-xl px-3 py-2 text-[0.85rem]",
              line.role === "user" && "self-end bg-primary/15",
              line.role === "assistant" && "self-start bg-muted",
              line.role === "error" && "self-start text-destructive",
            )}
            data-role={line.role}
          >
            {line.text}
            {line.role === "assistant" &&
              line.notices.map((n) => (
                <p
                  key={n}
                  role="alert"
                  className="mt-1.5 text-[0.8rem] text-amber-700 dark:text-amber-400"
                >
                  {n}
                </p>
              ))}
          </div>
        ))}
        {busy && <Spinner className="size-4 self-start" />}
        <div ref={end} />
      </div>

      {filled.length > 0 && (
        <ul
          aria-label="Filled in by the assistant"
          className="flex flex-col gap-1.5"
        >
          {filled.map((a) => (
            <li
              key={a.input_id}
              data-filled={a.input_id}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-[0.8rem]"
            >
              <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{labelOf(a.input_id)}</span>{" "}
                <span>{pretty(a.value)}</span>{" "}
                <Badge variant="outline">
                  {a.basis === "file_quote"
                    ? "From your file"
                    : a.basis === "proxy"
                      ? "Labeled default"
                      : a.basis === "user_said"
                        ? "Your figure"
                        : "AI estimate"}
                </Badge>
                <span className="block text-muted-foreground">
                  {a.rationale}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onReveal(a.input_id)}
              >
                Change
              </Button>
            </li>
          ))}
        </ul>
      )}

      {proposals.length > 0 && (
        <ul aria-label="Suggested values" className="flex flex-col gap-1.5">
          {proposals.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg border p-2 text-[0.8rem]"
              data-proposal={p.input_id}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{labelOf(p.input_id)}</span>{" "}
                <span className="text-muted-foreground">{p.said}</span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                aria-label={`Accept ${labelOf(p.input_id)}`}
                onClick={() => {
                  accept(
                    () => draft.applyProposal(p.input_id, p.value, p.tier),
                    p.input_id,
                  );
                  setProposals((ps) => ps.filter((x) => x.id !== p.id));
                }}
              >
                <Check />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Dismiss ${labelOf(p.input_id)}`}
                onClick={() =>
                  setProposals((ps) => ps.filter((x) => x.id !== p.id))
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <ul aria-label="Assistant cards" className="flex flex-col gap-2">
          {shown.map((card) => (
            <CardView
              key={card.id}
              card={card}
              draft={draft}
              onAccept={accept}
              onReveal={onReveal}
            />
          ))}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = message.trim();
          if (!text || busy) return;
          setMessage("");
          void send(text);
        }}
      >
        <Textarea
          aria-label="Message the assistant"
          rows={2}
          value={message}
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-h-0 text-[0.85rem]"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={!open || busy || !message.trim()}
        >
          <Send />
        </Button>
      </form>
      <Button type="button" disabled={!ready} onClick={onContinue}>
        Continue to Process <ArrowRight />
      </Button>
    </section>
  );
}

function CardView({
  card,
  draft,
  onAccept,
  onReveal,
}: {
  card: AssistantCard;
  draft: FormDraft;
  onAccept: (run: () => void, id: string) => void;
  onReveal: (id: string) => void;
}) {
  return (
    <li
      className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5 text-[0.8rem]"
      data-card={card.kind}
    >
      <p className="font-medium">{card.title}</p>
      {card.kind === "defaults" && (
        <>
          {card.fields.map((id) => {
            const d = draft.defaults[id]!;
            return (
              <div key={id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  {labelOf(id)}{" "}
                  <span className="font-semibold">{pretty(d.value)}</span>
                  {d.note && (
                    <span className="block text-[0.75rem] text-muted-foreground">
                      {d.note}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onAccept(() => draft.acceptProxy(id), id)}
                >
                  Use
                </Button>
              </div>
            );
          })}
          {card.fields.length > 1 && (
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() =>
                onAccept(() => {
                  for (const id of card.fields) draft.acceptProxy(id);
                }, card.fields[0]!)
              }
            >
              Use all
            </Button>
          )}
        </>
      )}
      {card.kind === "missing" && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onReveal(card.fields[0]!)}
          >
            Answer
          </Button>
          {card.options.includes("not_sure") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                onAccept(() => draft.notSure(card.fields[0]!), card.fields[0]!)
              }
            >
              Not sure
            </Button>
          )}
          {card.options.includes("use_default") &&
            draft.defaults[card.fields[0]!] && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onAccept(
                    () => draft.acceptProxy(card.fields[0]!),
                    card.fields[0]!,
                  )
                }
              >
                Use default
              </Button>
            )}
        </div>
      )}
      {card.kind === "evidence" && card.evidence && (
        <>
          <q className="break-words">{card.evidence.quote}</q>
          <span className="font-mono text-[11px] text-muted-foreground">
            {draft.files.find((f) => f.id === card.evidence!.file_id)?.name} ·{" "}
            {card.evidence.location}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() =>
              onAccept(
                () =>
                  draft.applyQuote(
                    card.evidence!.input_id,
                    card.evidence!.file_id,
                    card.evidence!.quote,
                  ),
                card.evidence!.input_id,
              )
            }
          >
            Use this quote
          </Button>
        </>
      )}
    </li>
  );
}
