import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  currentStep,
  parseStatusFilter,
  projectStatus,
  stepStates,
  type ProgressFacts,
} from "../../lib/project-progress";
import { listTeamProgress } from "../project-progress.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

const facts = (over: Partial<ProgressFacts> = {}): ProgressFacts => ({
  hasGoals: false,
  complete: false,
  latest: null,
  processing: false,
  ...over,
});

describe("project progress (pure)", () => {
  const cases: [string, ProgressFacts, string, string, number][] = [
    ["blank", facts(), "in_progress", "Intake", 1],
    ["goals only", facts({ hasGoals: true }), "in_progress", "Clarify", 2],
    [
      "complete form",
      facts({ hasGoals: true, complete: true }),
      "in_progress",
      "Process",
      3,
    ],
    [
      "running",
      facts({ hasGoals: true, complete: true, processing: true }),
      "in_progress",
      "Process",
      3,
    ],
    [
      "gap list",
      facts({
        hasGoals: true,
        complete: true,
        latest: { status: "gap_list", hasReport: false },
      }),
      "needs_review",
      "Review",
      4,
    ],
    [
      "released, no report",
      facts({
        hasGoals: true,
        complete: true,
        latest: { status: "released", hasReport: false },
      }),
      "needs_review",
      "Review",
      4,
    ],
    [
      "released with report",
      facts({
        hasGoals: true,
        complete: true,
        latest: { status: "released", hasReport: true },
      }),
      "complete",
      "Report",
      5,
    ],
  ];
  it.each(cases)("%s", (_name, f, status, label, position) => {
    expect(projectStatus(f)).toBe(status);
    expect(currentStep(f)).toMatchObject({ label, position });
  });

  it("marks Report done only for a released run with a report", () => {
    const released = { status: "released" as const, hasReport: true };
    expect(stepStates(facts({ latest: released })).report).toBe("done");
    expect(
      stepStates(facts({ latest: { ...released, hasReport: false } })).report,
    ).toBe("todo");
    // A gap list cannot have a report (reports need a released result).
    expect(
      stepStates(facts({ latest: { status: "gap_list", hasReport: true } }))
        .report,
    ).toBe("todo");
  });

  it("reads ?status= and falls back to all", () => {
    expect(parseStatusFilter("complete")).toBe("complete");
    expect(parseStatusFilter("bogus")).toBe("all");
    expect(parseStatusFilter(null)).toBe("all");
  });
});

describe("listTeamProgress (D1)", () => {
  let t: TestD1;
  let ids: ReturnType<typeof seedTeams>;
  const form = JSON.parse(
    readFileSync("docs/research/samples/sample-result.form.json", "utf8"),
  ) as { inputs: unknown[] };

  const project = (id: string, team = "t1") =>
    t.exec(
      "insert into projects (id,team_id,name,created_by) values (?,?,?,?)",
      id,
      team,
      id,
      ids.owner,
    );
  const saveForm = (projectId: string, json: unknown) =>
    t.exec(
      "insert into project_forms (project_id,form_json,updated_by) values (?,?,?)",
      projectId,
      JSON.stringify(json),
      ids.owner,
    );
  const file = (projectId: string, id: string) =>
    t.exec(
      "insert into files (id,project_id,r2_key,name,mime,size,description,uploaded_by) values (?,?,?,?,?,?,?,?)",
      id,
      projectId,
      `k/${id}`,
      "f.txt",
      "text/plain",
      1,
      "d",
      ids.owner,
    );
  const run = (
    id: string,
    projectId: string,
    status: string,
    finished: number | null,
  ) =>
    t.exec(
      "insert into runs (id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,started_at,finished_at) values (?,?,?,'stub','h','1','0.1','s1',?,?,?)",
      id,
      projectId,
      status,
      ids.owner,
      finished ?? 0,
      finished,
    );
  const report = (runId: string) =>
    t.exec(
      "insert into run_reports (id,run_id,r2_key,created_by) values (?,?,?,?)",
      `rep-${runId}`,
      runId,
      `r/${runId}`,
      ids.owner,
    );

  beforeEach(() => {
    t = createTestD1();
    env.DB = t.d1;
    ids = seedTeams(t);
  });

  it("computes each project's status and step in one pass, team-scoped", async () => {
    // p1 (seeded) stays blank. pB: goals only.
    project("pB");
    saveForm("pB", { ...form, inputs: [] });
    // pC: complete, never run; its form cites file f1, which it owns.
    project("pC");
    file("pC", "f1");
    saveForm("pC", form);
    // pD: latest run is a gap list; an older run released.
    project("pD");
    run("d-old", "pD", "released", 1000);
    run("d-new", "pD", "gap_list", 2000);
    // pE: released, no report, and a new run calculating.
    project("pE");
    run("e1", "pE", "released", 1000);
    run("e2", "pE", "running", null);
    // pF: released with a report.
    project("pF");
    run("f1", "pF", "released", 1000);
    report("f1");
    // Another team's project never appears.
    project("pX", "t2");
    run("x1", "pX", "released", 1000);

    const rows = await listTeamProgress("t1");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(Object.keys(by).sort()).toEqual([
      "p1",
      "pB",
      "pC",
      "pD",
      "pE",
      "pF",
    ]);
    expect(by.p1).toMatchObject({
      status: "in_progress",
      step: { position: 1 },
    });
    expect(by.pB).toMatchObject({
      status: "in_progress",
      step: { position: 2 },
    });
    expect(by.pC).toMatchObject({
      status: "in_progress",
      step: { position: 3 },
    });
    expect(by.pD).toMatchObject({
      status: "needs_review",
      step: { position: 4 },
    });
    expect(by.pE).toMatchObject({
      status: "needs_review",
      processing: true,
      step: { position: 4 },
    });
    expect(by.pF).toMatchObject({ status: "complete", step: { position: 5 } });
    expect(rows.filter((r) => r.processing).map((r) => r.id)).toEqual(["pE"]);
  });

  it("does not count a file from another project as the form's file", async () => {
    project("pC");
    project("pOther");
    file("pOther", "f1");
    saveForm("pC", form);
    const rows = await listTeamProgress("t1");
    expect(rows.find((r) => r.id === "pC")?.step.position).toBe(2);
  });
});
