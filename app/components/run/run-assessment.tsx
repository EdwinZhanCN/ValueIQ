import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRevalidator } from "react-router";
import { useAgent } from "agents/react";
import type { CallResult } from "../../../agents/valueiq-agent";
import type { RunView } from "../../../shared/types";
import {
  EMPTY_VIEW,
  callErrorText,
  type ConnectionState,
  type LatestOutcome,
  type MissingInput,
} from "~/lib/run-ui";
import { RunPanel } from "./run-panel";

const noop = () => () => {};
/** False on the server and during hydration, true afterwards: the socket is browser-only. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export interface RunAssessmentProps {
  projectId: string;
  /** The project has a saved form file (loader data). */
  hasForm: boolean;
  /** What the strict form validator rejects in the saved form. */
  missing: readonly MissingInput[];
  /** The newest saved outcome (loader data), or null. */
  latest: LatestOutcome | null;
}

/**
 * The Process step's run card. Connects to the project's `ValueIQAgent`
 * (`/agents/value-i-q-agent/{projectId}`, behind the access gate), reads its
 * synced `RunView`, and calls `startRun` and `cancelRun` over the agent's RPC.
 * The socket only opens in the browser.
 */
export function RunAssessment(props: RunAssessmentProps) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <RunPanel
        {...props}
        view={EMPTY_VIEW}
        connection="connecting"
        busy={false}
        cancelling={false}
        notice={null}
        onStart={noop}
        onCancel={noop}
      />
    );
  }
  return <ConnectedRunAssessment {...props} />;
}

function ConnectedRunAssessment(props: RunAssessmentProps) {
  const { projectId, hasForm, missing, latest } = props;
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const revalidator = useRevalidator();

  const agent = useAgent<RunView>({
    agent: "ValueIQAgent",
    name: projectId,
    onOpen: () => {
      setOpen(true);
      setEverOpened(true);
    },
    onClose: () => setOpen(false),
  });

  const view = agent.state ?? EMPTY_VIEW;
  const connection: ConnectionState = agent.connectionError
    ? "denied"
    : open
      ? "open"
      : everOpened
        ? "reconnecting"
        : "connecting";

  // When a run ends, refresh the layout's saved outcome (step bar, stale note).
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (view.status !== "released" && view.status !== "gap_list") return;
    const key = `${view.run_id}:${view.status}`;
    if (seen.current === key) return;
    seen.current = key;
    if (latest?.runId !== view.run_id) void revalidator.revalidate();
  }, [view.run_id, view.status, latest?.runId, revalidator]);

  const call = useCallback(
    async (
      method: "startRun" | "cancelRun",
      timeout: number,
    ): Promise<CallResult<RunView> | null> => {
      try {
        return await agent.call<CallResult<RunView>>(method, [], { timeout });
      } catch {
        setNotice(
          "The request did not reach the server. Check your connection and try again.",
        );
        return null;
      }
    },
    [agent],
  );

  const start = useCallback(async () => {
    // Strict validation gates the button; this re-check covers a stale page.
    if (!hasForm || missing.length > 0) return;
    setBusy(true);
    setNotice(null);
    const res = await call("startRun", 60_000);
    if (res && !res.ok) setNotice(callErrorText(res.error));
    else if (
      res?.value.status === "released" ||
      res?.value.status === "gap_list"
    )
      setNotice(
        "These inputs were already assessed, so the saved outcome is shown.",
      );
    setBusy(false);
  }, [call, hasForm, missing.length]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    setNotice(null);
    const res = await call("cancelRun", 30_000);
    if (res && !res.ok) setNotice(callErrorText(res.error));
    setCancelling(false);
  }, [call]);

  return (
    <RunPanel
      {...props}
      view={view}
      connection={connection}
      busy={busy}
      cancelling={cancelling}
      notice={notice}
      onStart={() => void start()}
      onCancel={() => void cancel()}
    />
  );
}
