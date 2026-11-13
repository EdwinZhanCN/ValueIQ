// Item 6a/6b: what Intake shows for a file, and Clarify's "Find in file" on the real file-text
// layer (D1 shim, in-memory R2) with the local scripted extractor. Quotes are checked by code.
import { beforeEach, describe, expect, it } from "vitest";
import { buildXlsx } from "../../../assistant/tests/evidence-fixtures";
import { summarizeRead, unreadable } from "../../lib/file-read";
import { enteredInputs } from "../../lib/entered-inputs";
import { findInFile, quoteChecks } from "../evidence.server";
import { getExtractedText } from "../file-text.server";
import { uploadProjectFile } from "../files.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";
import { FakeR2 } from "./r2-fake";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;
const vars = env as unknown as Record<string, string | undefined>;

const timesheet = () => {
  const weekly: (string | number)[][] = [
    ["Weekly log", "Week", "Hours before", "Hours after"],
  ];
  for (let a = 1; a <= 3; a++) weekly.push([`Analyst ${a}`, 1, 20, 15]);
  return buildXlsx([
    { name: "Weekly log", rows: weekly },
    {
      name: "Summary",
      rows: [
        ["Measure", "Value"],
        ["Hours saved per analyst per week", 5],
        ["Each analyst saves 5 hours per week in the pilot."],
      ],
    },
  ]);
};

const access = (projectId = "p1", teamId = "t1", userId = ids.owner) => ({
  projectId,
  teamId,
  userId,
  role: "owner" as const,
});

async function upload(
  name: string,
  bytes: Uint8Array,
  projectId = "p1",
  teamId = "t1",
  userId = ids.owner,
) {
  const r = await uploadProjectFile(
    { userId, teamId, projectId, role: "owner" },
    new File([bytes as BlobPart], name),
    "test file",
  );
  if (typeof r === "string") throw new Error(r);
  return r.id;
}

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  env.FILES = new FakeR2().asBucket();
  ids = seedTeams(t);
  t.exec(
    "insert into projects (id,team_id,name,created_by) values ('p2','t2','Other',?)",
    ids.outsider,
  );
  vars.VALUEIQ_MODEL = "dry";
  delete vars.GEMINI_API_KEY;
});

describe("Intake read summary (6a)", () => {
  it("counts sheets and rows and previews each sheet", async () => {
    const id = await upload("timesheet.xlsx", timesheet());
    const got = await getExtractedText(
      { projectId: "p1", userId: ids.owner },
      id,
    );
    if (!got.ok) throw new Error(got.message);
    const s = summarizeRead(got.text);
    expect(s).toMatchObject({
      ok: true,
      kind: "xlsx",
      text: "2 sheets, 7 rows",
    });
    if (!s.ok) return;
    expect(
      s.preview.some((p) => p.text.includes("Hours saved per analyst")),
    ).toBe(true);
  });

  it("says why a damaged file cannot be read", async () => {
    const id = await upload(
      "broken.xlsx",
      new TextEncoder().encode("not a spreadsheet"),
    );
    const got = await getExtractedText(
      { projectId: "p1", userId: ids.owner },
      id,
    );
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(unreadable(got.code, got.message)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/damaged|not read/) as string,
    });
  });
});

describe("Find in file (6b)", () => {
  it("returns quotes that are word for word in the file, at their cells", async () => {
    const id = await upload("timesheet.xlsx", timesheet());
    const r = await findInFile(access(), {
      inputId: "hours_saved_per_staff_week",
      fileId: id,
      value: 5,
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.scripted).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    const top = r.candidates[0]!;
    expect(top.form_check).toBe("matches");
    expect(top.location).toMatch(/^Summary!/);
    expect(top.quote).toMatch(/5/);
  });

  it("flags a different value instead of suggesting it", async () => {
    const id = await upload("timesheet.xlsx", timesheet());
    const r = await findInFile(access(), {
      inputId: "hours_saved_per_staff_week",
      fileId: id,
      value: 7,
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => c.form_check === "differs")).toBe(true);
  });

  it("answers FILE_NOT_FOUND for another project's file", async () => {
    const other = await upload(
      "theirs.xlsx",
      timesheet(),
      "p2",
      "t2",
      ids.outsider,
    );
    const r = await findInFile(access(), {
      inputId: "hours_saved_per_staff_week",
      fileId: other,
      value: 5,
    });
    expect(r).toMatchObject({ ok: false, code: "FILE_NOT_FOUND" });
  });

  it("says the assistant is unavailable without a model", async () => {
    delete vars.VALUEIQ_MODEL;
    const id = await upload("timesheet.xlsx", timesheet());
    const r = await findInFile(access(), {
      inputId: "hours_saved_per_staff_week",
      fileId: id,
      value: 5,
    });
    expect(r).toMatchObject({ ok: false, code: "NO_MODEL" });
  });
});

describe("Quote check column (6c)", () => {
  it("reads a run's quote_check events into the inputs table", async () => {
    t.exec(
      "insert into runs (id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,started_at) values ('r1','p1','released','stub','h','1','0.1','s1',?,0)",
      ids.owner,
    );
    const ev = (seq: number, payload: object) =>
      t.exec(
        "insert into run_events (run_id,seq,step,type,payload_json,created_at) values ('r1',?,'Files read','quote_check',?,0)",
        seq,
        JSON.stringify(payload),
      );
    ev(1, { input_id: "hours_saved_per_staff_week", result: "found" });
    ev(2, { input_id: "error_cost", result: "not_found" });
    const checks = await quoteChecks("p1", "r1");
    expect(checks).toEqual({
      hours_saved_per_staff_week: "found",
      error_cost: "not_found",
    });
    expect(await quoteChecks("p2", "r1")).toEqual({});
    const rows = enteredInputs(
      {
        inputs: [
          {
            id: "hours_saved_per_staff_week",
            value: 5,
            tier: "documented",
            origin: "file",
          },
          {
            id: "staff_affected",
            value: 10,
            tier: "documented",
            origin: "user",
          },
        ],
      },
      [],
      checks,
    )!;
    expect(rows.map((r) => r.quoteCheck)).toEqual(["found", null]);
  });
});
