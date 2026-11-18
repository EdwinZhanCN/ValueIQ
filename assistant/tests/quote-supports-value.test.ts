import { describe, expect, it } from "vitest";
import { quoteSupportsValue } from "../../app/lib/intake-form";

describe("quoteSupportsValue", () => {
  it("accepts the figure itself", () =>
    expect(
      quoteSupportsValue("Average handle time is 12.5 minutes", 12.5),
    ).toBe(true));
  it("accepts a unit change (minutes to hours)", () =>
    expect(quoteSupportsValue("It takes 30 minutes", 0.5)).toBe(true));
  it("strips thousands commas", () =>
    expect(quoteSupportsValue("Spend was $1,200,000", 1200000)).toBe(true));
  it("rejects a passage without the figure", () =>
    expect(quoteSupportsValue("Handle time improved a lot", 12)).toBe(false));
  it("rejects a different number", () =>
    expect(quoteSupportsValue("Handle time is 18 minutes", 12)).toBe(false));
});

import { validateFormFile } from "../../app/lib/intake-form";
import { goldenResultForm } from "../../engine/tests/forms";

describe("reviewer must be a team member", () => {
  function formWithReviewer(name: string) {
    const form = goldenResultForm();
    const input = form.inputs.find((i) => i.backing !== undefined);
    if (input?.backing) input.backing.verified_by = name;
    return form;
  }
  const files = (form: ReturnType<typeof goldenResultForm>) =>
    Object.keys(form.file_descriptions ?? {}).map((id) => ({
      id,
      projectId: "p1",
    }));
  it("flags a reviewer who is not on the team, only when the roster is given", () => {
    const form = formWithReviewer("Not A Member");
    const ctx = { projectId: "p1", files: files(form) };
    const base = validateFormFile(form, ctx).map((i) => i.code);
    const withRoster = validateFormFile(form, {
      ...ctx,
      members: ["Eli Dalelio"],
    }).map((i) => i.code);
    expect(base).not.toContain("REVIEWER_NOT_MEMBER");
    expect(
      form.inputs.some((i) => i.backing?.verified_by === "Not A Member"),
    ).toBe(true);
    expect(withRoster).toContain("REVIEWER_NOT_MEMBER");
  });
});

describe("measured needs a passage with the figure", () => {
  it("is demoted to documented by the engine when the quote lacks the number", async () => {
    const { effectiveTier } = await import("../../engine/evidence");
    const ctx = { known_file_ids: new Set(["f1"]) } as never;
    const input = {
      id: "hours_saved_per_person_per_week",
      value: 5,
      tier: "measured",
      origin: "file",
      backing: {
        source_file_id: "f1",
        quote: "Handle time improved a lot",
        quote_confirmed: true,
      },
    } as never;
    expect(effectiveTier(input, ctx, false).tier).toBe("documented");
  });
});
