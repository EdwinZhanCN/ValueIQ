import { describe, expect, it } from "vitest";
import { computeProject } from "../index";
import { goldenResultForm, OPTS } from "./forms";

// The MVP profile (app/server/team-settings.server.ts) cuts estimates 5-15%, not 25-40%.
const MVP_BANDS = {
  measured: [0, 0],
  documented: [0, 0.1],
  benchmark: [0.03, 0.12],
  estimate: [0.05, 0.15],
  assumption: [0.4, 0.6],
} as const;

describe("MVP evidence bands", () => {
  const form = goldenResultForm();
  form.inputs = form.inputs.map((i) =>
    i.id === "hours_saved_per_staff_week"
      ? {
          ...i,
          tier: "estimate" as const,
          origin: "assistant_estimate" as const,
        }
      : i,
  );
  it("with the engine defaults, an estimate effect input drops the driver", () => {
    const r = computeProject(form, OPTS).result;
    expect(r?.coverage?.excluded ?? ["x"]).toContain("time_savings");
  });
  it("with the MVP bands, the same estimate is counted and still discounted", () => {
    const out = computeProject(form, {
      ...OPTS,
      config: { bands: { ...MVP_BANDS } as never },
    });
    expect(out.result?.coverage?.included).toContain("time_savings");
    const d = out.result!.drivers.find((x) => x.id === "time_savings")!;
    expect(d.haircut_pct).toBeGreaterThanOrEqual(5);
    expect(d.haircut_pct).toBeLessThanOrEqual(15);
  });
});
