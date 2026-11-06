// Structural check that a value is a well-formed RunOutput (K13). Returns a list of problems.
import { assertJsonSafe } from "./present";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function checkRunOutput(x: unknown): string[] {
  const problems: string[] = [];
  const need = (o: unknown, path: string, keys: string[]) => {
    if (!isObj(o)) {
      problems.push(`${path} is not an object`);
      return;
    }
    for (const k of keys) if (!(k in o)) problems.push(`${path}.${k} missing`);
  };
  try {
    assertJsonSafe(x);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "not JSON-safe");
  }
  if (!isObj(x)) return [...problems, "output is not an object"];
  need(x, "$", ["kind", "meta"]);
  need(x["meta"], "$.meta", [
    "run_id",
    "mode",
    "label",
    "currency",
    "horizon_years",
    "discount_rate_pct",
    "scenario",
    "tier_counts",
    "contract_version",
    "formula_version",
    "settings_version",
    "generated_at",
  ]);
  const hasR = "result" in x;
  const hasG = "gap_list" in x;
  if (hasR === hasG)
    problems.push("exactly one of result and gap_list must be present");
  if (x["kind"] === "result") {
    if (!hasR) problems.push("kind result without result");
    need(x["result"], "$.result", [
      "headline",
      "drivers",
      "costs",
      "cash_flows",
      "scenarios",
      "sensitivity",
      "charts",
      "confidence",
      "narrative",
      "unquantified",
      "flexibility",
      "doing_nothing_risks",
      "proceeding_risks",
      "measurement_plan",
      "proxies_used",
      "overrides",
      "warnings",
    ]);
    const r = x["result"];
    if (isObj(r)) {
      need(r["headline"], "$.result.headline", [
        "npv",
        "roi",
        "payback",
        "benefits_pv",
        "costs_pv",
        "null_reasons",
      ]);
      if (!Array.isArray(r["drivers"]))
        problems.push("drivers is not an array");
      else
        r["drivers"].forEach((d, i) => {
          need(d, `$.result.drivers[${i}]`, [
            "id",
            "label_class",
            "label",
            "included",
            "steps",
            "annual",
            "haircut_pct",
            "confidence",
            "tier_counts",
            "total",
            "pv",
            "share_of_benefit",
            "measured_by",
            "risk_factors",
          ]);
          const steps = isObj(d) ? d["steps"] : null;
          if (Array.isArray(steps))
            steps.forEach((s, j) =>
              need(s, `$.result.drivers[${i}].steps[${j}]`, [
                "ref",
                "order",
                "name",
                "label",
                "formula",
                "inputs",
                "source_type",
                "by_year",
                "value",
                "evidence_tier",
              ]),
            );
        });
      need(r["confidence"], "$.result.confidence", [
        "integrity",
        "drivers",
        "project",
        "band_note",
      ]);
    }
  } else if (x["kind"] === "gap_list") {
    if (!hasG) problems.push("kind gap_list without gap_list");
    need(x["gap_list"], "$.gap_list", [
      "reason",
      "project_confidence",
      "project_floor",
      "items",
      "dropped_drivers",
    ]);
  } else problems.push("kind must be result or gap_list");
  return problems;
}
