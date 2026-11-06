import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRunOutput } from "../../shared/output";
import { computeProject } from "../project";
import { goldenGapForm, goldenResultForm } from "./forms";

describe("engine to output consumer boundary", () => {
  for (const name of readdirSync(
    new URL("../fixtures/round1/", import.meta.url),
  ).filter((name) => name.endsWith(".json"))) {
    it(`preserves all published ${name} fields`, () => {
      const source: unknown = JSON.parse(
        readFileSync(
          new URL(`../fixtures/round1/${name}`, import.meta.url),
          "utf8",
        ),
      );
      expect(parseRunOutput(source)).toEqual(source);
    });
  }
  for (const [name, form] of [
    ["result", goldenResultForm()],
    ["gap_list", goldenGapForm()],
  ] as const) {
    it(`accepts a real computed ${name} without modifying its values`, () => {
      const output = computeProject(form, {
        run_id: `real-${name}`,
        generated_at: "2026-11-05T12:00:00Z",
        mode: "real",
      });
      expect(output.kind).toBe(name);
      expect(parseRunOutput(output)).toEqual(output);
    });
  }
});
