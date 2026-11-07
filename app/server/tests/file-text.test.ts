/* eslint-disable @typescript-eslint/require-await -- async stand-ins for host and bucket calls */
// K17 file evidence: the server layer (access, project scoping, size limit, cache) on the real
// Drizzle queries and migrations over the D1 shim, with an in-memory R2 bucket.
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDocx,
  buildXlsx,
} from "../../../assistant/tests/evidence-fixtures";
import { MAX_FILE_BYTES } from "../files.server";
import { READ_EXCERPT_CHARS } from "../../../assistant/evidence/limits";
import {
  extractedKey,
  getExtractedText,
  makeFileHost,
  readProjectFileForModel,
  type FileEvent,
} from "../file-text.server";
import { uploadProjectFile } from "../files.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";
import { FakeR2 } from "./r2-fake";

const SECRET = "CONFIDENTIAL-QUARTERLY-FIGURE-8841";
let t: TestD1;
let r2: FakeR2;
let ids: ReturnType<typeof seedTeams>;

const owner = () => ({ projectId: "p1", userId: ids.owner });
const upload = async (
  name: string,
  bytes: Uint8Array,
  mime = "application/octet-stream",
  projectId = "p1",
  teamId = "t1",
  userId = ids.owner,
) => {
  const r = await uploadProjectFile(
    { userId, teamId, projectId, role: "owner" },
    new File([bytes as BlobPart], name, { type: mime }),
    "test file",
  );
  if (typeof r === "string") throw new Error(r);
  return r.id;
};

beforeEach(() => {
  t = createTestD1();
  r2 = new FakeR2();
  env.DB = t.d1;
  env.FILES = r2.asBucket();
  ids = seedTeams(t);
  // a second project in the other team, owned by the outsider
  t.exec(
    "insert into projects (id,team_id,name,created_by) values ('p2','t2','Other',?)",
    ids.outsider,
  );
});

const doc = () =>
  buildDocx([
    { p: "Results", style: "Heading1" },
    { p: `Each analyst saved 5 hours per week. ${SECRET}` },
  ]);

describe("K17 server: access, scoping and limits", () => {
  it("reads a project file and returns a bounded, located, untrusted excerpt", async () => {
    const id = await upload("pilot.docx", doc());
    const r = await readProjectFileForModel(owner(), id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.excerpt.untrusted).toBe(true);
    expect(r.excerpt.excerpt[1]?.loc).toBe("p2");
    expect(r.excerpt.excerpt[1]?.heading).toBe("Results");
    expect(r.excerpt.excerpt[1]?.text).toContain("5 hours per week");
    expect(r.excerpt.name).toBe("pilot.docx");
  });

  it("caps the excerpt size and pages through a large file", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => [
      `row ${i}`,
      "lorem ipsum dolor sit amet ".repeat(8),
    ]);
    const id = await upload("big.xlsx", buildXlsx([{ name: "Data", rows }]));
    const first = await readProjectFileForModel(owner(), id);
    expect(first.ok && first.excerpt.next_start).not.toBeNull();
    if (!first.ok) return;
    const chars = first.excerpt.excerpt.reduce((n, s) => n + s.text.length, 0);
    expect(chars).toBeLessThanOrEqual(READ_EXCERPT_CHARS);
    const second = await readProjectFileForModel(owner(), id, {
      start: first.excerpt.next_start ?? 0,
    });
    expect(second.ok && second.excerpt.excerpt[0]?.loc).not.toBe(
      first.excerpt.excerpt[0]?.loc,
    );
    const q = await readProjectFileForModel(owner(), id, { query: "row 399" });
    expect(q.ok && q.excerpt.excerpt).toHaveLength(1);
    const sec = await readProjectFileForModel(owner(), id, { section: "Data" });
    expect(sec.ok && sec.excerpt.matching_segments).toBe(400);
    const bad = await readProjectFileForModel(owner(), id, {
      section: "Nope",
    });
    expect(!bad.ok && bad.code).toBe("BAD_INPUT");
  });

  it("refuses a file id from another project, a missing id, and a non-member", async () => {
    const mine = await upload("a.docx", doc());
    const theirs = await upload(
      "b.docx",
      doc(),
      "application/octet-stream",
      "p2",
      "t2",
      ids.outsider,
    );
    // the other team's file, asked for through my project
    const foreign = await readProjectFileForModel(owner(), theirs);
    expect(!foreign.ok && foreign.code).toBe("FILE_NOT_FOUND");
    // a file of my own team's other project is also refused (scoped to the project asked about)
    t.exec(
      "insert into projects (id,team_id,name,created_by) values ('p3','t1','Sibling',?)",
      ids.owner,
    );
    const sibling = await upload("c.docx", doc(), "", "p3");
    const cross = await readProjectFileForModel(owner(), sibling);
    expect(!cross.ok && cross.code).toBe("FILE_NOT_FOUND");
    const missing = await readProjectFileForModel(owner(), "no-such-file");
    expect(!missing.ok && missing.code).toBe("FILE_NOT_FOUND");
    // a user who is not on the project's team gets ACCESS_DENIED and no file contents
    const outsider = await readProjectFileForModel(
      { projectId: "p1", userId: ids.outsider },
      mine,
    );
    expect(!outsider.ok && outsider.code).toBe("ACCESS_DENIED");
    // a member passes
    const member = await readProjectFileForModel(
      { projectId: "p1", userId: ids.member },
      mine,
    );
    expect(member.ok).toBe(true);
    // odd ids are refused before any query
    const odd = await getExtractedText(owner(), "x".repeat(500));
    expect(!odd.ok && odd.code).toBe("BAD_INPUT");
  });

  it("refuses an over-limit file without reading it", async () => {
    t.exec(
      "insert into files (id,project_id,r2_key,name,mime,size,description,uploaded_by) values ('huge','p1','teams/t1/projects/p1/files/huge','huge.xlsx','x/y',?,'d',?)",
      MAX_FILE_BYTES + 1,
      ids.owner,
    );
    const r = await readProjectFileForModel(owner(), "huge");
    expect(!r.ok && r.code).toBe("TOO_LARGE");
    expect(r2.gets.get("teams/t1/projects/p1/files/huge")).toBeUndefined();
  });

  it("answers unsupported and corrupt files with a refusal code", async () => {
    const png = await upload("pic.png", new Uint8Array([1, 2, 3]), "image/png");
    const a = await getExtractedText(owner(), png);
    expect(!a.ok && a.code).toBe("UNSUPPORTED_TYPE");
    const bad = await upload("broken.docx", new Uint8Array([1, 2, 3, 4, 5]));
    const b = await getExtractedText(owner(), bad);
    expect(!b.ok && b.code).toBe("FILE_UNREADABLE");
  });
});

describe("K17 server: cache keyed by content", () => {
  it("extracts once, stores under the extracted/ prefix, and hits the cache next time", async () => {
    const id = await upload("pilot.docx", doc());
    const events: FileEvent[] = [];
    const log = (e: FileEvent) => events.push(e);
    const a = await getExtractedText(owner(), id, log);
    expect(a.ok && a.cached).toBe(false);
    expect(r2.objects.has(extractedKey("t1", "p1", id))).toBe(true);
    const srcKey = `teams/t1/projects/p1/files/${id}`;
    const sourceReads = r2.gets.get(srcKey) ?? 0;
    const b = await getExtractedText(owner(), id, log);
    expect(b.ok && b.cached).toBe(true);
    expect(r2.gets.get(srcKey) ?? 0).toBe(sourceReads); // the file itself was not read again
    expect(a.ok && b.ok && a.text.sha256 === b.text.sha256).toBe(true);
    expect(events.map((e) => e.type)).toEqual([
      "file_extract",
      "file_cache_hit",
    ]);
  });

  it("rebuilds when the source object changed or the cache entry is damaged", async () => {
    const id = await upload("pilot.docx", doc());
    const srcKey = `teams/t1/projects/p1/files/${id}`;
    const first = await getExtractedText(owner(), id);
    expect(first.ok).toBe(true);
    // same file id, different content (a new etag): the cached text must not be reused
    await r2.put(srcKey, buildDocx([{ p: "Totally different text" }]));
    const second = await getExtractedText(owner(), id);
    expect(second.ok && second.cached).toBe(false);
    expect(second.ok && second.text.segments[0]?.text).toBe(
      "Totally different text",
    );
    await r2.put(extractedKey("t1", "p1", id), "{not json");
    const third = await getExtractedText(owner(), id);
    expect(third.ok && third.cached).toBe(false);
  });

  it("caches a refusal too, so a hostile file is not re-parsed on every call", async () => {
    const png = await upload("pic.png", new Uint8Array([1, 2, 3]), "image/png");
    await getExtractedText(owner(), png);
    const srcKey = `teams/t1/projects/p1/files/${png}`;
    const reads = r2.gets.get(srcKey) ?? 0;
    const again = await getExtractedText(owner(), png);
    expect(!again.ok && again.code).toBe("UNSUPPORTED_TYPE");
    expect(r2.gets.get(srcKey) ?? 0).toBe(reads);
  });
});

describe("K17 server: logs carry ids and hashes only", () => {
  it("no event holds file text", async () => {
    const id = await upload("pilot.docx", doc());
    const events: unknown[] = [];
    const host = makeFileHost(
      owner(),
      async () => ({
        value: { candidates: [] },
        usage: { prompt: 1, output: 1, thoughts: 0, total: 2 },
        model: "m",
      }),
      (e) => events.push(e),
    );
    await host.readForModel(id, {});
    await host.readForModel(id, {});
    const log = JSON.stringify(events);
    expect(log).toContain(id);
    expect(log).not.toContain(SECRET);
    expect(log).not.toContain("5 hours");
  });
});
