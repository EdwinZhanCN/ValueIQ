// A D1Database stand-in over node:sqlite, so the real Drizzle queries and the real migrations
// run in unit tests. Only the calls Drizzle's d1 driver makes are implemented.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Param = string | number | bigint | null;

class Stmt {
  private params: Param[] = [];
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
  ) {}
  bind(...p: Param[]) {
    this.params = p;
    return this;
  }
  private rows(): Record<string, unknown>[] {
    return this.db.prepare(this.sql).all(...this.params);
  }
  all() {
    return Promise.resolve({ results: this.rows(), success: true, meta: {} });
  }
  raw() {
    const stmt = this.db.prepare(this.sql);
    stmt.setReturnArrays(true);
    return Promise.resolve(stmt.all(...this.params) as unknown as unknown[][]);
  }
  run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return Promise.resolve({
      results: [],
      success: true,
      meta: { changes: Number(r.changes) },
    });
  }
  first() {
    return Promise.resolve(this.rows()[0] ?? null);
  }
}

export interface TestD1 {
  d1: D1Database;
  exec(sql: string, ...p: Param[]): void;
}

export function createTestD1(): TestD1 {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = "drizzle";
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    for (const part of readFileSync(`${dir}/${f}`, "utf8").split(
      "--> statement-breakpoint",
    ))
      if (part.trim()) db.exec(part);
  const shim = {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      return out;
    },
  };
  return {
    d1: shim as unknown as D1Database,
    exec: (sql, ...p) => void db.prepare(sql).run(...p),
  };
}

/** A team with an owner and a member, another team with an outsider, and one project. */
export function seedTeams(t: TestD1) {
  const ids = {
    projectId: "p1",
    owner: "u-owner",
    member: "u-member",
    outsider: "u-out",
  };
  for (const [id, n] of [
    [ids.owner, "owner"],
    [ids.member, "member"],
    [ids.outsider, "outsider"],
  ] as const)
    t.exec(
      "insert into user (id,name,email) values (?,?,?)",
      id,
      n,
      `${n}@x.test`,
    );
  t.exec(
    "insert into organization (id,name,slug,created_at) values ('t1','T','t1',0)",
  );
  t.exec(
    "insert into organization (id,name,slug,created_at) values ('t2','O','t2',0)",
  );
  t.exec(
    "insert into member (id,organization_id,user_id,role,created_at) values ('m1','t1',?,'owner',0)",
    ids.owner,
  );
  t.exec(
    "insert into member (id,organization_id,user_id,role,created_at) values ('m2','t1',?,'member',0)",
    ids.member,
  );
  t.exec(
    "insert into member (id,organization_id,user_id,role,created_at) values ('m3','t2',?,'owner',0)",
    ids.outsider,
  );
  t.exec(
    "insert into projects (id,team_id,name,created_by) values ('p1','t1','P',?)",
    ids.owner,
  );
  return ids;
}
