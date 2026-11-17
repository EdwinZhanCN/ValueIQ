// Q7 (#93): a project's uploads together stay within 25 MB, on the real Drizzle
// queries over the D1 shim with an in-memory R2 bucket.
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
  projectBytes,
  uploadProjectFile,
} from "../files.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";
import { FakeR2 } from "./r2-fake";

const MB = 1024 * 1024;
let t: TestD1;
let r2: FakeR2;
let ids: ReturnType<typeof seedTeams>;

const upload = (bytes: number, name = "f.bin") =>
  uploadProjectFile(
    { userId: ids.owner, teamId: "t1", projectId: "p1", role: "owner" },
    new File([new Uint8Array(bytes)], name),
    "filler",
  );

beforeEach(() => {
  t = createTestD1();
  r2 = new FakeR2();
  env.DB = t.d1;
  env.FILES = r2.asBucket();
  ids = seedTeams(t);
});

describe("project upload limit (25 MB)", () => {
  it("accepts an upload that lands exactly on the limit", async () => {
    expect(MAX_PROJECT_BYTES).toBe(25 * MB);
    expect(await upload(MAX_FILE_BYTES)).toMatchObject({ size: 10 * MB });
    expect(await upload(MAX_FILE_BYTES)).toMatchObject({ size: 10 * MB });
    expect(await upload(5 * MB)).toMatchObject({ size: 5 * MB });
    expect(await projectBytes("p1")).toBe(25 * MB);
  });

  it("refuses one byte over and leaves no row or object behind", async () => {
    await upload(10 * MB);
    await upload(10 * MB);
    expect(await upload(5 * MB + 1)).toBe("project_full");
    expect(await upload(6 * MB)).toBe("project_full");
    expect(await projectBytes("p1")).toBe(20 * MB);
    expect(r2.objects.size).toBe(2);
    // A file that fits still goes in after a refusal.
    expect(await upload(5 * MB)).toMatchObject({ size: 5 * MB });
    expect(await upload(1)).toBe("project_full");
    expect(r2.objects.size).toBe(3);
  });

  it("keeps the limit when two uploads race past the first check", async () => {
    await upload(10 * MB);
    await upload(10 * MB);
    // Each fits alone (20 + 4 = 24 MB) but not both (28 MB).
    const results = await Promise.all([
      upload(4 * MB, "a"),
      upload(4 * MB, "b"),
    ]);
    expect(await projectBytes("p1")).toBeLessThanOrEqual(MAX_PROJECT_BYTES);
    const kept = results.filter((r) => typeof r !== "string").length;
    expect(kept).toBeLessThanOrEqual(1);
    expect(results.some((r) => r === "project_full")).toBe(true);
    // R2 holds exactly the objects D1 knows about.
    expect(r2.objects.size).toBe(2 + kept);
  });

  it("counts only this project's files", async () => {
    t.exec(
      "insert into projects (id,team_id,name,created_by) values ('p9','t1','Q',?)",
      ids.owner,
    );
    await uploadProjectFile(
      { userId: ids.owner, teamId: "t1", projectId: "p9", role: "owner" },
      new File([new Uint8Array(10 * MB)], "other"),
      "filler",
    );
    expect(await projectBytes("p1")).toBe(0);
    expect(await upload(10 * MB)).toMatchObject({ size: 10 * MB });
  });
});
