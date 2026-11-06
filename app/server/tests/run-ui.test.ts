// Unit tests for the run UI helpers (app/lib/run-ui.ts). The UI only formats
// what the engine saved, so these pin the formatting, the null handling, and
// the button/label state for each run status.
import { describe, expect, it } from "vitest";
import sampleGap from "../../../docs/research/samples/sample-gap-list.json";
import sampleResult from "../../../docs/research/samples/sample-result.json";
import type { RunView } from "../../../shared/types";
import {
  EMPTY_VIEW,
  callErrorText,
  checklistItems,
  clampPct,
  connectionNote,
  intakeHref,
  money,
  percent,
  runControls,
  runHeading,
  share,
  summarizeOutput,
  utcStamp,
  type ConnectionState,
  type GapSummary,
  type ResultSummary,
} from "../../lib/run-ui";

const LABELS = ["Files read", "Haircuts", "Drivers"];
function view(over: Partial<RunView> = {}): RunView {
  return {
    ...EMPTY_VIEW,
    checklist: LABELS.map((label) => ({ label, state: "todo" as const })),
    ...over,
  };
}
const ctl = (
  v: RunView,
  o: { connection?: ConnectionState; hasForm?: boolean; busy?: boolean } = {},
) =>
  runControls({
    view: v,
    connection: o.connection ?? "open",
    hasForm: o.hasForm ?? true,
    busy: o.busy ?? false,
  });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("number formatting", () => {
  it("formats money with 2 decimals, half-up, and the currency symbol", () => {
    expect(money(127956.73, "USD")).toBe("$127,956.73");
    expect(money(-18641.93, "USD")).toBe("-$18,641.93");
    expect(money(1.005, "USD")).toBe("$1.01");
    expect(money(0, "USD")).toBe("$0.00");
    expect(money(1234.5, "CHF")).toBe("1,234.50 CHF");
  });
  it("formats percent with 1 decimal, half-up", () => {
    expect(percent(202.88)).toBe("202.9%");
    expect(percent(-15.55)).toBe("-15.6%");
    expect(percent(0.25)).toBe("0.3%");
    expect(share(0.615)).toBe("61.5%");
  });
  it("never turns a missing number into 0", () => {
    expect(money(null, "USD")).toBe("Not available");
    expect(percent(undefined)).toBe("Not available");
    expect(money(Number.NaN, "USD")).toBe("Not available");
  });
  it("clamps progress to a whole 0-100", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(33.4)).toBe(33);
    expect(clampPct(Number.NaN)).toBe(0);
  });
  it("writes the UTC stamp like the form's saved time", () => {
    expect(utcStamp("2026-11-05T12:00:00Z")).toBe("2026-11-05 12:00 UTC");
  });
});

describe("runControls", () => {
  it("idle with a saved form: Start is enabled", () => {
    const c = ctl(view());
    expect(c.start).toEqual({ show: true, enabled: true, label: "Start run" });
    expect(c.cancel.show).toBe(false);
    expect(c.retry.show).toBe(false);
    expect(c.reason).toBeNull();
  });
  it("idle without a saved form: Start is disabled and says why", () => {
    const c = ctl(view(), { hasForm: false });
    expect(c.start.show).toBe(true);
    expect(c.start.enabled).toBe(false);
    expect(c.preflight.enabled).toBe(false);
    expect(c.reason).toMatch(/Save the intake form first/);
  });
  it("disables Start while disconnected and explains it", () => {
    for (const connection of [
      "connecting",
      "reconnecting",
      "denied",
    ] as const) {
      const c = ctl(view(), { connection });
      expect(c.start.enabled).toBe(false);
      expect(c.reason).toBe(connectionNote(connection));
    }
  });
  it("disables Start while a call is in flight", () => {
    expect(ctl(view(), { busy: true }).start.enabled).toBe(false);
  });
  it("running and preflight: Cancel shows, Start hides", () => {
    for (const status of ["running", "preflight"] as const) {
      const c = ctl(view({ status }));
      expect(c.cancel).toEqual({ show: true, enabled: true });
      expect(c.start.show).toBe(false);
      expect(c.preflight.show).toBe(false);
    }
  });
  it("Cancel stays usable during a long readiness call but not while cancelling", () => {
    const running = view({ status: "preflight" });
    expect(
      runControls({
        view: running,
        connection: "open",
        hasForm: true,
        busy: true,
      }).cancel.enabled,
    ).toBe(true);
    expect(
      runControls({
        view: running,
        connection: "open",
        hasForm: true,
        busy: false,
        cancelling: true,
      }).cancel.enabled,
    ).toBe(false);
  });
  it("failed and retryable: Retry shows instead of Start", () => {
    const c = ctl(
      view({
        status: "failed",
        error: { code: "MODEL_ERROR", message: "x", retryable: true },
      }),
    );
    expect(c.retry).toEqual({ show: true, enabled: true });
    expect(c.start.show).toBe(false);
  });
  it("failed and not retryable: no Retry, a Start new run instead", () => {
    const c = ctl(
      view({
        status: "failed",
        error: { code: "BAD_INPUT", message: "x", retryable: false },
      }),
    );
    expect(c.retry.show).toBe(false);
    expect(c.start).toEqual({
      show: true,
      enabled: true,
      label: "Start new run",
    });
  });
  it("failed with no error object is not retryable", () => {
    expect(ctl(view({ status: "failed" })).retry.show).toBe(false);
  });
  it("finished and cancelled runs offer Run again", () => {
    for (const status of ["released", "gap_list", "cancelled"] as const)
      expect(ctl(view({ status })).start.label).toBe("Run again");
  });
  it("blocked_on_question counts as active", () => {
    const c = ctl(view({ status: "blocked_on_question" }));
    expect(c.cancel.show).toBe(true);
    expect(c.start.show).toBe(false);
  });
});

describe("run view labels", () => {
  it("maps every status to a heading", () => {
    const statuses = [
      "idle",
      "preflight",
      "running",
      "blocked_on_question",
      "released",
      "gap_list",
      "failed",
      "cancelled",
    ] as const;
    for (const status of statuses)
      expect(runHeading(view({ status })).title.length).toBeGreaterThan(0);
    expect(runHeading(view({ status: "gap_list" })).tone).toBe("attention");
    expect(runHeading(view({ status: "failed" })).tone).toBe("error");
    expect(runHeading(view({ status: "blocked_on_question" })).detail).toMatch(
      /not supported yet/,
    );
  });
  it("carries the orchestrator's step label while running", () => {
    expect(
      runHeading(view({ status: "running", step: "Haircuts" })).detail,
    ).toBe("Haircuts");
  });
  it("keeps checklist order and adds screen-reader text", () => {
    const items = checklistItems(
      view({
        checklist: [
          { label: "Files read", state: "done" },
          { label: "Haircuts", state: "doing" },
          { label: "Drivers", state: "todo" },
          { label: "Project", state: "error" },
        ],
      }),
    );
    expect(items.map((i) => i.label)).toEqual([
      "Files read",
      "Haircuts",
      "Drivers",
      "Project",
    ]);
    expect(items.map((i) => i.text)).toEqual([
      "Done",
      "In progress",
      "Waiting",
      "Failed",
    ]);
  });
  it("turns call errors into plain text", () => {
    expect(
      callErrorText({
        code: "ACCESS_DENIED",
        message: "Access denied",
        retryable: false,
      }),
    ).toMatch(/no longer have access/);
    expect(
      callErrorText({
        code: "BAD_INPUT",
        message: "No form has been saved yet",
        retryable: false,
      }),
    ).toMatch(/Save the intake form first/);
    expect(
      callErrorText({
        code: "NOT_SUPPORTED",
        message: "Mid-run questions are not supported yet",
        retryable: false,
      }),
    ).toBe("Mid-run questions are not supported yet");
  });
});

describe("summarizeOutput: result", () => {
  const s = summarizeOutput(sampleResult) as ResultSummary;
  const row = (key: string) => s.rows.find((r) => r.key === key)!;
  it("reads the saved result and carries the STUB flag", () => {
    expect(s.kind).toBe("result");
    expect(s.stub).toBe(true);
    expect(s.label).toBe("Pre-funding estimate");
    expect(s.assumptions).toBe("USD, 3-year horizon, 10.0% discount rate");
  });
  it("formats NPV for both bases", () => {
    expect(row("npv").capacity.text).toBe("$127,956.73");
    expect(row("npv").hard.text).toBe("-$18,641.93");
  });
  it("labels both ROIs separately", () => {
    expect(row("roi_undiscounted").label).toBe("ROI, undiscounted");
    expect(row("roi_pv").label).toBe("ROI, NPV over PV of costs");
    expect(row("roi_undiscounted").capacity.text).toBe("202.9%");
    expect(row("roi_pv").capacity.text).toBe("169.9%");
    expect(row("roi_pv").hard.text).toBe("-24.8%");
  });
  it("uses the engine's payback text", () => {
    expect(row("payback").capacity.text).toBe(
      "1.0 years (uniform-flow assumption)",
    );
    expect(row("payback").hard.text).toBe(
      "No payback within the selected horizon",
    );
  });
  it("passes the confidence band note through", () => {
    expect(s.bandNote).toMatch(/7 documented inputs/);
  });
  it("shows the engine's reason for a null, never 0", () => {
    const out = clone(sampleResult);
    const h = out.result.headline as unknown as {
      npv: { hard: number | null };
      roi: { pv: { hard: number | null } };
      null_reasons: Record<string, string>;
    };
    h.npv.hard = null;
    h.roi.pv.hard = null;
    h.null_reasons = { "npv.hard": "No documented cash reduction" };
    const r = summarizeOutput(out) as ResultSummary;
    const npv = r.rows.find((x) => x.key === "npv")!;
    expect(npv.hard).toEqual({
      text: "Not available",
      reason: "No documented cash reduction",
    });
    expect(npv.capacity.reason).toBeNull();
    const pv = r.rows.find((x) => x.key === "roi_pv")!;
    expect(pv.hard.text).toBe("Not available");
    expect(pv.hard.reason).toMatch(/No reason was recorded/);
  });
  it("marks a real run as not a stub", () => {
    const real = clone(sampleResult);
    real.meta.mode = "real";
    expect((summarizeOutput(real) as ResultSummary).stub).toBe(false);
  });
  it("accepts the column as a JSON string", () => {
    expect(summarizeOutput(JSON.stringify(sampleResult))?.kind).toBe("result");
  });
});

describe("summarizeOutput: gap list", () => {
  const g = summarizeOutput(sampleGap) as GapSummary;
  it("reads the ranked what-to-add list", () => {
    expect(g.kind).toBe("gap_list");
    expect(g.stub).toBe(true);
    expect(g.confidence).toBe("61.5%");
    expect(g.floor).toBe("85.0%");
    expect(g.items.map((i) => i.rank)).toEqual([1, 2]);
    expect(g.items[0]).toMatchObject({
      label: "Hours saved per person per week",
      confidenceNow: "61.5%",
      confidenceIfAdded: "100.0%",
      inputId: "hours_saved_per_staff_week",
    });
  });
  it("sorts by rank", () => {
    const shuffled = clone(sampleGap);
    shuffled.gap_list.items.reverse();
    const r = summarizeOutput(shuffled) as GapSummary;
    expect(r.items.map((i) => i.rank)).toEqual([1, 2]);
  });
});

describe("summarizeOutput: unreadable input", () => {
  it("returns null instead of inventing figures", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "not json",
      {},
      { kind: "result" },
      { kind: "result", meta: {}, result: {} },
      { kind: "gap_list", meta: {}, gap_list: {} },
      { kind: "other", meta: {} },
    ])
      expect(summarizeOutput(bad)).toBeNull();
  });
});

describe("links", () => {
  it("builds the intake deep link from return_to", () => {
    expect(intakeHref("p1", "hours_saved_per_staff_week")).toBe(
      "/projects/p1?input=hours_saved_per_staff_week#intake",
    );
    expect(intakeHref("p1", null)).toBe("/projects/p1#intake");
    expect(intakeHref("p1", "a b")).toBe("/projects/p1?input=a%20b#intake");
  });
});
