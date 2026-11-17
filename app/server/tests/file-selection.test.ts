import { describe, expect, it } from "vitest";
import { unselectFileAt } from "../../lib/file-selection";

describe("pending file selection", () => {
  it("unselects only the requested file without mutating the batch", () => {
    const first = { name: "first.pdf" };
    const second = { name: "second.pdf" };
    const third = { name: "third.pdf" };
    const selected = [first, second, third];

    expect(unselectFileAt(selected, 1)).toEqual([first, third]);
    expect(selected).toEqual([first, second, third]);
  });

  it("distinguishes duplicate file selections by their position", () => {
    const duplicate = { name: "evidence.pdf" };

    expect(unselectFileAt([duplicate, duplicate], 0)).toEqual([duplicate]);
  });
});
