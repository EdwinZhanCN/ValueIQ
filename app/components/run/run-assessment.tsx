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
} from "~/lib/run-ui";
import { RunPanel, type ReadinessReport } from "./run-panel";

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
  /** The newest saved outcome (loader data), or null. */
  latest: LatestOutcome | null;
}

/**
 * Run assessment section of the project page. Connects to the project's
 * `ValueIQAgent` (`/agents/value-i-q-agent/{projectId}`, behind the access
 * gate), reads its synced `RunView`, and calls `startRun`, `cancelRun` and
 * `preflight` over the agent's RPC. The socket only opens in the browser.
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
        readiness={null}
        onStart={noop}
        onCancel={noop}
        onRetry={noop}
        onReadiness={noop}
      />
    );
  }
  return <ConnectedRunAssessment {...props} />;
}

function ConnectedRunAssessment({
  projectId,
  hasForm,
  latest,
}: RunAssessmentProps) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
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

  // When a run ends, fetch the saved outcome the loader reads.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (view.status !== "released" && view.status !== "gap_list") return;
    const key = `${view.run_id}:${view.status}`;
    if (seen.current === key) return;
    seen.current = key;
    if (latest?.runId !== view.run_id) void revalidator.revalidate();
  }, [view.run_id, view.status, latest?.runId, revalidator]);

  const call = useCallback(
    async <T,>(
      method: "startRun" | "cancelRun" | "preflight",
      timeout: number,
    ): Promise<CallResult<T> | null> => {
      try {
        return await agent.call<CallResult<T>>(method, [], { timeout });
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
    setBusy(true);
    setNotice(null);
    setReadiness(null);
    const res = await call<RunView>("startRun", 60_000);
    if (res && !res.ok) setNotice(callErrorText(res.error));
    else if (
      res?.value.status === "released" ||
      res?.value.status === "gap_list"
    )
      setNotice(
        "These inputs were already assessed, so the saved outcome is shown. Change the form to run again.",
      );
    setBusy(false);
  }, [call]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    setNotice(null);
    const res = await call<RunView>("cancelRun", 30_000);
    if (res && !res.ok) setNotice(callErrorText(res.error));
    setCancelling(false);
  }, [call]);

  const checkReadiness = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setReadiness(null);
    const res = await call<ReadinessReport & { cancelled: boolean }>(
      "preflight",
      180_000,
    );
    if (res && !res.ok) setNotice(callErrorText(res.error));
    else if (res?.ok && !res.value.cancelled)
      setReadiness({ passed: res.value.passed, message: res.value.message });
    setBusy(false);
  }, [call]);

  return (
    <RunPanel
      projectId={projectId}
      view={view}
      connection={connection}
      hasForm={hasForm}
      busy={busy}
      cancelling={cancelling}
      notice={notice}
      readiness={readiness}
      latest={latest}
      onStart={() => void start()}
      onRetry={() => void start()}
      onCancel={() => void cancel()}
      onReadiness={() => void checkReadiness()}
    />
  );
}
