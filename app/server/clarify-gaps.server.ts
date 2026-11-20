import type { FormFile } from "../../shared/form";
import { OPTIONAL, pathsOf, sectionsFor } from "../components/clarify/draft";

/**
 * Every Clarify field that still has no value, in asking order. This mirrors the Inputs panel (its
 * required fields, the optional ones skipped) so the assistant works from the same list the user
 * sees. A field marked "Not sure" counts as missing here: it has no number, so the assistant may be
 * asked to estimate it.
 */
export function clarifyGaps(form: FormFile): string[] {
  const byId = new Map(form.inputs.map((i) => [i.id, i]));
  const ids = sectionsFor(form.goals, pathsOf(form))
    .filter((section) => section.key !== "context")
    .flatMap((section) =>
      section.key === "settings"
        ? ["currency", "horizon_years", ...section.ids]
        : section.ids,
    );
  return [...new Set(ids)].filter((id) => {
    if (OPTIONAL.has(id)) return false;
    if (id === "currency") return !/^[A-Z]{3}$/.test(form.currency);
    if (id === "horizon_years")
      return !(
        Number.isInteger(form.horizon_years) &&
        form.horizon_years >= 1 &&
        form.horizon_years <= 20
      );
    return byId.get(id)?.value == null;
  });
}
