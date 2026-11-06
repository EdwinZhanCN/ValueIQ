import { beforeEach, expect, it } from "vitest";
import { handleFormSave } from "../form-save.server";
import { getProjectForm } from "../projects.server";
import { blankIntake } from "../../lib/intake-draft";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams } from "./d1-shim";

let owner: string;
beforeEach(() => {
  const database = createTestD1();
  env.DB = database.d1;
  owner = seedTeams(database).owner;
});
function request(form: unknown, baseUpdatedAt = "") {
  return new Request("http://localhost/projects/p1/form", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      formJson: JSON.stringify(form),
      baseUpdatedAt,
    }),
  });
}
it("saves a partial step form without requiring a client flag or adding wire fields", async () => {
  const draft = {
    ...blankIntake(),
    inputs: [
      { id: "cost_annual_run", value: 200, tier: "estimate", origin: "user" },
    ],
  };
  const result = await handleFormSave(request(draft), "p1", owner);
  expect(result.data.saved).toBe(true);
  expect((await getProjectForm("p1"))?.formJson).toEqual(draft);
});
it("rejects forged file ownership in a normal step save and preserves saved content", async () => {
  const original = blankIntake();
  await handleFormSave(request(original), "p1", owner);
  const saved = await getProjectForm("p1");
  const forged = {
    ...original,
    file_descriptions: { "other-project-file": "Forged evidence" },
  };
  const result = await handleFormSave(
    request(forged, saved!.updatedAt.toISOString()),
    "p1",
    owner,
  );
  expect(result.data.saved).toBe(false);
  expect(result.init?.status).toBe(400);
  expect((await getProjectForm("p1"))?.formJson).toEqual(original);
});
