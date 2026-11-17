/**
 * The report layout: which sections, in what order, and which fixed charts.
 * One whitelist for the Report page, the server and the PDF template. The
 * browser only chooses what goes in and the order; every number in the PDF
 * still comes from the stored run output.
 */
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
  { id: "summary", label: "Summary", pdfTitle: "Executive summary" },
  { id: "results", label: "Results", pdfTitle: "Results" },
  { id: "charts", label: "Charts", pdfTitle: "Charts" },
  {
    id: "scenarios",
    label: "Scenarios",
    pdfTitle: "Scenarios and sensitivity",
  },
  {
    id: "assumptions",
    label: "Assumptions",
    pdfTitle: "Context and assumptions",
  },
  {
    id: "unquantified",
    label: "Unquantified",
    pdfTitle: "Unquantified benefits and flexibility",
  },
  {
    id: "risks",
    label: "Risks",
    pdfTitle: "Risks of doing nothing vs proceeding",
  },
  {
    id: "measurement",
    label: "Measurement plan",
    pdfTitle: "Measurement plan",
  },
  { id: "audit", label: "Audit trail", pdfTitle: "Appendix and audit trail" },
] as const;
export type SectionId = (typeof REPORT_SECTIONS)[number]["id"];

export type ReportLayout = { sections: SectionId[]; charts: ChartId[] };

/** The standard report: every section in page order, the three standard charts. */
export const DEFAULT_LAYOUT: ReportLayout = {
  sections: REPORT_SECTIONS.map((s) => s.id),
  charts: ["waterfall", "npv_discount", "driver_mix"],
};

const SECTION_IDS = new Set<string>(REPORT_SECTIONS.map((s) => s.id));
const CHART_IDS = new Set<string>(REPORT_CHARTS.map((c) => c.id));

/** Charts in their fixed order, and none when the Charts section is out. */
export function normalizeLayout(layout: ReportLayout): ReportLayout {
  const charts = layout.sections.includes("charts")
    ? REPORT_CHARTS.map((c) => c.id).filter((id) => layout.charts.includes(id))
    : [];
  return { sections: [...layout.sections], charts };
}

function idList(
  raw: string,
  known: Set<string>,
  what: string,
): string[] | string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return `${what} must be a JSON list.`;
  }
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    return `${what} must be a list of ids.`;
  const ids = value as string[];
  const unknown = ids.find((id) => !known.has(id));
  if (unknown !== undefined)
    return `Unknown ${what.toLowerCase()} id: ${unknown}`;
  if (new Set(ids).size !== ids.length) return `${what} lists an id twice.`;
  return ids;
}

export type ParsedLayout =
  { ok: true; layout: ReportLayout } | { ok: false; error: string };

/**
 * Reads the two form fields (`sections`, `charts`: JSON lists of ids). Missing
 * fields fall back to the default; unknown or repeated ids and an empty
 * section list are refused.
 */
export function parseReportLayout(
  sectionsRaw: string | null,
  chartsRaw: string | null,
): ParsedLayout {
  let sections: SectionId[] = DEFAULT_LAYOUT.sections;
  let charts: ChartId[] = DEFAULT_LAYOUT.charts;
  if (sectionsRaw !== null) {
    const ids = idList(sectionsRaw, SECTION_IDS, "Sections");
    if (typeof ids === "string") return { ok: false, error: ids };
    if (ids.length === 0)
      return { ok: false, error: "Choose at least one section." };
    sections = ids as SectionId[];
  }
  if (chartsRaw !== null) {
    const ids = idList(chartsRaw, CHART_IDS, "Charts");
    if (typeof ids === "string") return { ok: false, error: ids };
    charts = ids as ChartId[];
  }
  return { ok: true, layout: normalizeLayout({ sections, charts }) };
}

/** A stored layout (`run_reports.layout_json`), or the default when none was recorded. */
export function storedLayout(value: unknown): ReportLayout {
  const v = value as Partial<ReportLayout> | null;
  if (!v || !Array.isArray(v.sections) || !Array.isArray(v.charts))
    return DEFAULT_LAYOUT;
  const parsed = parseReportLayout(
    JSON.stringify(v.sections),
    JSON.stringify(v.charts),
  );
  return parsed.ok ? parsed.layout : DEFAULT_LAYOUT;
}
