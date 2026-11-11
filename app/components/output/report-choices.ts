/** Chart identifiers understood by the shared preview component. */
export const REPORT_CHARTS = [
  { id: "waterfall", label: "Gross → adjusted" },
  { id: "npv_discount", label: "NPV by discount rate" },
  { id: "driver_mix", label: "Driver mix" },
  { id: "npv_adoption", label: "NPV by adoption" },
  { id: "npv_haircut", label: "NPV by evidence discount" },
  { id: "hard_capacity", label: "Hard vs. capacity" },
] as const;
export type ChartId = (typeof REPORT_CHARTS)[number]["id"];

export const REPORT_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "results", label: "Results" },
  { id: "charts", label: "Charts" },
  { id: "scenarios", label: "Scenarios" },
  { id: "assumptions", label: "Assumptions" },
  { id: "unquantified", label: "Unquantified" },
  { id: "risks", label: "Risks" },
  { id: "measurement", label: "Measurement plan" },
  { id: "audit", label: "Audit trail" },
] as const;
export type SectionId = (typeof REPORT_SECTIONS)[number]["id"];

/** Every generated PDF contains these three charts, in this order. */
export const STANDARD_REPORT_CHARTS = [
  "waterfall",
  "npv_discount",
  "driver_mix",
] as const satisfies readonly ChartId[];
