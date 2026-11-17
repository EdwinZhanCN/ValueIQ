import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import type { EvidenceCandidate, EvidenceReply } from "../../lib/evidence";
import { useEvidence } from "./evidence-context";
import type { FormDraft } from "./use-form-draft";

/**
 * "Find in file" under one effect input: quotes from the chosen file that
 * state this figure, each already checked word for word against the file.
 * "Use this quote" fills the quote; the user still ticks the confirmation.
 */
export function FindInFile({
  id,
  fileId,
  value,
  draft,
}: {
  id: string;
  fileId: string;
  value: number;
  draft: FormDraft;
}) {
  const evidence = useEvidence();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; reply: EvidenceReply; for: string }
  >({ kind: "idle" });
  const key = `${fileId}:${value}`;
  async function find() {
    setState({ kind: "busy" });
    let reply: EvidenceReply;
    try {
      const r = await fetch(`/projects/${draft.projectId}/evidence`, {
        method: "POST",
        body: new URLSearchParams({
          inputId: id,
          fileId,
          value: String(value),
        }),
      });
      reply = r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : { ok: false, code: "HTTP", message: "The lookup failed." };
    } catch {
      reply = { ok: false, code: "NETWORK", message: "The lookup failed." };
    }
    setState({ kind: "done", reply, for: key });
  }
  const reply = state.kind === "done" && state.for === key ? state.reply : null;
  return (
    <div className="flex flex-col gap-2" data-testid={`find-in-file-${id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!evidence.available || state.kind === "busy"}
          title={evidence.reason ?? undefined}
          onClick={() => void find()}
        >
          {state.kind === "busy" ? (
            <Spinner className="size-3.5" />
          ) : (
            <Search className="size-3.5" />
          )}
          Find in file
        </Button>
        {!evidence.available && (
          <span className="text-xs text-muted-foreground">
            Assistant unavailable
          </span>
        )}
        {evidence.available && evidence.scripted && (
          <span className="rounded-full border px-2 text-[11px] text-muted-foreground">
            Scripted model · local
          </span>
        )}
      </div>
      {reply && !reply.ok && (
        <p role="alert" className="text-xs text-destructive">
          {reply.message}
        </p>
      )}
      {reply?.ok && reply.candidates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing in this file states this figure.
        </p>
      )}
      {reply?.ok && reply.candidates.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Quotes found in file">
          {reply.candidates.map((c) => (
            <Candidate
              key={`${c.location}|${c.quote}`}
              c={c}
              value={value}
              onUse={() => draft.applyQuote(id, fileId, c.quote)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Candidate({
  c,
  value,
  onUse,
}: {
  c: EvidenceCandidate;
  value: number;
  onUse: () => void;
}) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-2.5 text-xs">
      <q className="break-words">{c.quote}</q>
      <span className="font-mono text-[11px] text-muted-foreground">
        {c.location}
      </span>
      {c.form_check === "matches" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={onUse}
        >
          Use this quote
        </Button>
      ) : (
        <span className="text-amber-700 dark:text-amber-400">
          {c.form_check === "differs"
            ? `The file says ${c.value_in_quote}; you entered ${value.toLocaleString("en-US")}.`
            : "The number in this passage could not be compared with yours."}
        </span>
      )}
    </li>
  );
}
