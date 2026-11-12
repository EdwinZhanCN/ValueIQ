import { describe, expect, expectTypeOf, it } from "vitest";
import sample from "../../../docs/research/samples/sample-result.form.json";
import { validateIntakeDraft } from "../../lib/intake-draft";
import {
  readFormDraft,
  serializeFormFile,
  validateFormFile,
} from "../../lib/intake-form";
import { asFormFile } from "../run-wiring.server";
import type { FormFile } from "../../../shared/form";
import type { FormFile as EngineFormFile } from "../../../engine/types";

const blankIntake = () => readFormDraft(null);
const context = { projectId: "p1", files: [{ id: "f1", projectId: "p1" }] };
describe("project intake handoff", () => {
  it("uses exactly the same canonical form type in engine and input code", () => {
    expectTypeOf<FormFile>().toEqualTypeOf<EngineFormFile>();
  });
  it("saves incomplete drafts without weakening strict exports or allowing runs", () => {
    const draft = blankIntake();
    expect(validateIntakeDraft(draft, context)).toEqual([]);
    expect(
      validateIntakeDraft(JSON.parse(JSON.stringify(draft)), context),
    ).toEqual([]);
    expect(validateFormFile(draft, context).length).toBeGreaterThan(0);
  });
  it("preserves canonical producer bytes through a persisted JSON round trip", () => {
    const canonical = sample as FormFile;
    const engineForm: EngineFormFile = canonical;
    expect(engineForm).toEqual(sample);
    const serialized = serializeFormFile(canonical, context);
    const loaded: unknown = JSON.parse(serialized);
    expect(validateIntakeDraft(loaded, context)).toEqual([]);
    expect(loaded).toEqual(canonical);
    expect(serializeFormFile(loaded, context)).toBe(serialized);
    expect(asFormFile(loaded)).toEqual(canonical);
  });
  it("rejects forged evidence IDs and unsupported data instead of losing the original", () => {
    expect(
      validateIntakeDraft(sample, { projectId: "p2", files: context.files }),
    ).not.toEqual([]);
    expect(validateIntakeDraft({ ...sample, version: 2 }, context)).not.toEqual(
      [],
    );
    expect(
      validateIntakeDraft({ ...sample, unsupported_field: 2 }, context),
    ).not.toEqual([]);
    expect(validateIntakeDraft({ unrecognized: true }, context)).not.toEqual(
      [],
    );
    expect(validateIntakeDraft(null, context)).not.toEqual([]);
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
});
