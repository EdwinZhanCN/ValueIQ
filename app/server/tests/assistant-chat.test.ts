// Item 7: the assistant turn the agent's `chat` runs, on the D1 shim and in-memory R2 with the
// local scripted model. Cards cover every missing input; nothing is written to the form.
import { clarifyGaps } from "../clarify-gaps.server";
import { beforeEach, describe, expect, it } from "vitest";
import { buildXlsx } from "../../../assistant/tests/evidence-fixtures";
import type { FormFile } from "../../../shared/form";
import { validateFormFile } from "../../lib/intake-form";
import { assistantChat } from "../assistant.server";
import { uploadProjectFile } from "../files.server";
import { getProjectForm, saveProjectForm } from "../projects.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";
import { FakeR2 } from "./r2-fake";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;
const vars = env as unknown as Record<string, string | undefined>;

const empty = (over: Partial<FormFile> = {}): FormFile => ({
  version: 1,
  goals: ["time_savings", "data_quality", "decision_speed", "risk_reduction"],
  currency: "USD",
  horizon_years: 0,
  inputs: [],
  file_descriptions: {},
  other_notes: "",
  measurement_plan: {},
  asked: [],
  ...over,
});

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  env.FILES = new FakeR2().asBucket();
  ids = seedTeams(t);
  vars.VALUEIQ_MODEL = "dry";
  delete vars.GEMINI_API_KEY;
});

const scope = () => ({ projectId: "p1", userId: ids.owner });

describe("assistant chat (item 7)", () => {
  it("opens with defaults and one card for every missing input", async () => {
    const draft = empty();
    const r = await assistantChat(scope(), {
      message: "",
      history: [],
      draft,
    });
    if (!r.ok) throw new Error(r.error.message);
    const missing = new Set([
      ...clarifyGaps(draft),
      ...validateFormFile(draft, { projectId: "p1", files: [] }).map(
        (i) => i.field,
      ),
    ]);
    const cards = r.value.cards.filter((c) => c.kind === "missing");
    expect(new Set(cards.map((c) => c.fields[0]))).toEqual(missing);
    expect(cards.length).toBe(missing.size);
    expect(r.value.cards[0]?.kind).toBe("defaults");
    expect(
      r.value.cards
        .filter((c) => c.kind === "defaults")
        .flatMap((c) => c.fields),
    ).toContain("discount_rate_pct");
    expect(r.value.mode).toBe("stub");
  }, 30_000);

  it("proposes the user's figures and writes nothing", async () => {
    await saveProjectForm("p1", empty({ goals: ["time_savings"] }), ids.owner);
    const before = JSON.stringify((await getProjectForm("p1"))?.formJson);
    const r = await assistantChat(scope(), {
      message: "we have 10 analysts, each saves about 5 hours a week",
      history: [{ role: "assistant", text: "Hello." }],
      draft: null,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.proposals.map((p) => [p.input_id, p.value])).toEqual([
      ["staff_affected", 10],
      ["hours_saved_per_staff_week", 5],
    ]);
    expect(JSON.stringify((await getProjectForm("p1"))?.formJson)).toBe(before);
  }, 30_000);

  it("offers a checked quote from a project file", async () => {
    const bytes = buildXlsx([
      {
        name: "Summary",
        rows: [
          ["Measure", "Value"],
          ["Hours saved per analyst per week", 5],
        ],
      },
    ]);
    const up = await uploadProjectFile(
      { userId: ids.owner, teamId: "t1", projectId: "p1", role: "owner" },
      new File([bytes as BlobPart], "timesheet.xlsx"),
      "Pilot timesheet",
    );
    if (typeof up === "string") throw new Error(up);
    const draft = empty({
      goals: ["time_savings"],
      inputs: [
        {
          id: "hours_saved_per_staff_week",
          value: 5,
          tier: "estimate",
          origin: "user",
          backing: { source_file_id: up.id },
        },
      ],
      file_descriptions: { [up.id]: "Pilot timesheet" },
    });
    const r = await assistantChat(scope(), {
      message: "find the hours saved in the timesheet",
      history: [],
      draft,
    });
    if (!r.ok) throw new Error(r.error.message);
    const card = r.value.cards.find((c) => c.kind === "evidence");
    expect(card?.evidence).toMatchObject({
      input_id: "hours_saved_per_staff_week",
      file_id: up.id,
      quote: "Hours saved per analyst per week | 5",
    });
    expect(card?.evidence?.location).toMatch(/^Summary!/);
  }, 30_000);

  it("refuses bad arguments and says when there is no model", async () => {
    for (const args of [
      { message: 5, history: [], draft: null },
      { message: "x".repeat(2001), history: [], draft: null },
      { message: "hi", history: "nope", draft: null },
      { message: "hi", history: [{ role: "system", text: "x" }], draft: null },
      {
        message: "hi",
        history: Array.from({ length: 25 }, () => ({ role: "user", text: "" })),
        draft: null,
      },
      { message: " ", history: [{ role: "user", text: "a" }], draft: null },
    ])
      expect(await assistantChat(scope(), args)).toMatchObject({
        ok: false,
        error: { code: "BAD_INPUT" },
      });
    delete vars.VALUEIQ_MODEL;
    expect(
      await assistantChat(scope(), { message: "", history: [], draft: null }),
    ).toMatchObject({ ok: false, error: { code: "NO_MODEL" } });
  });
});
