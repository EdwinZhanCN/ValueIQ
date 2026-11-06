// Writes real-engine outputs for five review cases to engine/fixtures/round1/.
// Run: node_modules/.bin/tsx engine/scripts/gen-round1.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { computeProject } from "../project";
import type { RunOutput } from "../types";
import {
  backing,
  goldenGapForm,
  goldenResultForm,
  inp,
  simpleForm,
} from "../tests/forms";

const OUT = new URL("../fixtures/round1/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const NOW = "2026-11-05T12:00:00Z";
const o = (id: string) => ({
  run_id: id,
  generated_at: NOW,
  mode: "real" as const,
});

const cases: Record<string, () => RunOutput> = {
  "r1-result": () => computeProject(goldenResultForm(), o("run_r1_result")),
  "r1-gap-list": () => computeProject(goldenGapForm(), o("run_r1_gap")),
  "r1-hard-cash": () =>
    computeProject(
      simpleForm({}, [
        inp("realized_as_cash", 20000, "documented", {
          backing: backing("source", "verified", "coverage", "recent"),
        }),
      ]),
      o("run_r1_cash"),
    ),
  "r1-warning-concentration": () => {
    // two drivers, time savings dominant: shows DRIVER_CONCENTRATION
    const f = goldenResultForm();
    f.goals = ["time_savings", "data_quality"];
    f.inputs = f.inputs
      .filter(
        (i) => !["aro_before", "aro_after", "loss_per_event"].includes(i.id),
      )
      .map((i) => (i.id === "cost_per_error" ? { ...i, value: 10 } : i));
    return computeProject(f, o("run_r1_warn"));
  },
  "r1-customer-borne": () => {
    const f = goldenResultForm();
    f.inputs.push(inp("cost_bearer", "customer", "documented"));
    return computeProject(f, o("run_r1_cust"));
  },
};

for (const [name, fn] of Object.entries(cases)) {
  const out = fn();
  writeFileSync(
    new URL(`${name}.json`, OUT),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(`${name}: ${out.kind}`);
}
