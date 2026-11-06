import { describe, expect, expectTypeOf, it } from "vitest";
import sample from "../../../docs/research/samples/sample-result.form.json";
import {
  blankIntake,
  hydrateIntake,
  intakePaths,
  validateIntakeDraft,
} from "../../lib/intake-draft";
import { serializeFormFile, validateFormFile } from "../../lib/intake-form";
import { asFormFile } from "../run-wiring.server";
import type { FormFile } from "../../../shared/form";
import type { FormFile as EngineFormFile } from "../../../engine/types";

const context = { projectId: "p1", files: [{ id: "f1", projectId: "p1" }] };
describe("project intake handoff", () => {
  it("uses exactly the same canonical form type in engine and input code", () => {
    expectTypeOf<FormFile>().toEqualTypeOf<EngineFormFile>();
  });
  it("saves incomplete drafts without weakening strict exports or allowing runs", () => {
    const draft = { ...blankIntake(), intake_draft_version: 1 };
    expect(validateIntakeDraft(draft, context)).toEqual([]);
    expect(hydrateIntake(JSON.parse(JSON.stringify(draft)), context)).toEqual(
      draft,
    );
    expect(validateFormFile(draft, context).length).toBeGreaterThan(0);
    expect(() => asFormFile(draft)).toThrow(/Complete and save/);
  });
  it("preserves canonical producer bytes through a persisted JSON round trip", () => {
    const canonical = sample as FormFile;
    const engineForm: EngineFormFile = canonical;
    expect(engineForm).toEqual(sample);
    const serialized = serializeFormFile(canonical, context);
    const loaded = hydrateIntake(JSON.parse(serialized), context);
    expect(loaded).toEqual(canonical);
    expect(serializeFormFile(loaded, context)).toBe(serialized);
    expect(asFormFile(loaded)).toEqual(canonical);
  });
  it("rejects forged evidence IDs and unsupported data instead of losing the original", () => {
    expect(
      hydrateIntake(sample, { projectId: "p2", files: context.files }),
    ).toBeNull();
    expect(hydrateIntake({ ...sample, version: 2 }, context)).toBeNull();
    expect(
      hydrateIntake({ ...sample, intake_draft_version: 2 }, context),
    ).toBeNull();
    expect(hydrateIntake({ unrecognized: true }, context)).toBeNull();
    expect(hydrateIntake(null, context)).toBeNull();
  });
  it("retains partial-form validation for invalid values and provenance", () => {
    const invalid = {
      ...blankIntake(),
      inputs: [
        {
          id: "discount_rate_pct",
          value: 105,
          tier: "estimate",
          origin: "user",
        },
      ],
    };
    expect(
      validateIntakeDraft(invalid, context).some(
        (issue) => issue.code === "BOUNDS",
      ),
    ).toBe(true);
    expect(
      validateIntakeDraft(
        { ...blankIntake(), goals: ["invented"] },
        context,
      ).some((issue) => issue.code === "GOALS"),
    ).toBe(true);
  });
  it("reveals alternate paths for saved values and gap-list targets", () => {
    expect(intakePaths(blankIntake(), "minutes_per_task_after").time).toBe(
      "tasks",
    );
    expect(intakePaths(blankIntake(), "error_rate_after").quality).toBe(
      "rates",
    );
    expect(intakePaths(blankIntake(), "exposure_factor_pct").risk).toBe(
      "asset",
    );
    expect(intakePaths(blankIntake(), "cost_per_clean_unit").errorCost).toBe(
      "derived",
    );
  });
});
