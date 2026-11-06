import released from "../../../docs/research/samples/sample-result.json";
import gaps from "../../../docs/research/samples/sample-gap-list.json";
import {
  parseRunOutput,
  type ResultOutput,
  type GapOutput,
  type EngineResult,
} from "../../../shared/output";

// Preview fixtures use the shared version 1 runtime validator. Final contract
// alignment remains owned by the engine track.
const resultValue = parseRunOutput(released);
const gapValue = parseRunOutput(gaps);
if (resultValue.kind !== "result" || gapValue.kind !== "gap_list")
  throw new Error("Invalid preview fixtures");
export const resultSample = resultValue;
export const gapSample = gapValue;
export type ResultSample = ResultOutput;
export type GapSample = GapOutput;
export type Driver = ResultSample["result"]["drivers"][number];
export type Step = Driver["steps"][number];
export type SensitivityPoint =
  EngineResult["sensitivity"]["discount_rate"][number];

const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function money(
  value: number | null,
  currency = "USD",
  reason = "Not available",
) {
  return value === null
    ? reason
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
}

// ROI and *_pct fields are already percentage points in the supplied samples.
export function percent(value: number | null, reason = "Not available") {
  return value === null ? reason : `${decimal.format(value)}%`;
}

// Intl percent formatting converts only the representation of a ratio.
export function confidence(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export const labels: Record<string, string> = {
  hard_savings: "Hard savings",
  capacity_value: "Capacity value",
  avoided_loss: "Expected avoided loss",
  incremental_profit: "Incremental profit",
  customer_benefit: "Customer benefit",
  time_savings: "Time savings",
  data_quality: "Data quality",
  risk_reduction: "Risk reduction",
  decision_speed: "Decision speed",
};
