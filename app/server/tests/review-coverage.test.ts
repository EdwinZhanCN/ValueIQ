import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { computeProject } from "../../../engine";
import { goldenResultForm, OPTS } from "../../../engine/tests/forms";
import { parseRunOutput } from "../../../shared/output";
import { NumbersView } from "../../components/output/result-views";

function html(over?: (r: ReturnType<typeof parseRunOutput>) => void) {
  const out = parseRunOutput(
    JSON.parse(JSON.stringify(computeProject(goldenResultForm(), OPTS))),
  );
  if (out.kind !== "result") throw new Error("expected a result");
  over?.(out);
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(NumbersView, { output: out }),
    ),
  );
}

describe("Review: coverage line and what must be true (F2, F4)", () => {
  it("states the break-even benefit per year and what the case models", () => {
    const h = html();
    expect(h).toContain('data-testid="break-even"');
    expect(h).toContain("To break even you need about");
    expect(h).toContain("This case models about");
  });

  it("says all goals are in when none was left out", () => {
    const h = html();
    expect(h).toContain('data-testid="coverage"');
    expect(h).toContain("selected goals are in this result");
    expect(h).not.toContain('role="alert"');
  });

  it("warns when a goal was left out, so confidence is never read alone", () => {
    const h = html((out) => {
      if (out.kind !== "result" || !out.result.coverage) return;
      out.result.coverage = {
        ...out.result.coverage,
        excluded: ["risk_reduction"],
        text: "2 of 3 selected goals are in this result; Risk reduction left out for lack of evidence, so the headline understates the full case.",
      };
    });
    expect(h).toContain("left out for lack of evidence");
    expect(h).toContain('role="alert"');
  });

  it("shows nothing for an older stored result that has neither field", () => {
    const h = html((out) => {
      if (out.kind !== "result") return;
      delete out.result.coverage;
      delete out.result.break_even;
    });
    expect(h).not.toContain('data-testid="coverage"');
    expect(h).not.toContain('data-testid="break-even"');
  });
});
