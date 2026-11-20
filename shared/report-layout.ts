/**
 * The report presentation contract: preset, sections, charts and optional
 * display-only cover text. The browser chooses presentation; every financial
 * value still comes from the stored run output.
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

export const REPORT_LAYOUT_VERSION = 2 as const;
export const REQUIRED_REPORT_SECTIONS = [
  "summary",
  "audit",
] as const satisfies readonly SectionId[];
export const MAX_REPORT_COVER_FIELD_LENGTH = 120;

export type ReportPresetId = "standard" | "executive" | "financial" | "custom";

export type ReportCover = {
  title?: string;
  preparedFor?: string;
  preparedBy?: string;
};

/** Historical rows stored before layouts were versioned. */
export type ReportLayoutV1 = {
  version: 1;
  sections: SectionId[];
  charts: ChartId[];
};

export type ReportLayoutV2 = {
  version: typeof REPORT_LAYOUT_VERSION;
  preset: ReportPresetId;
  sections: SectionId[];
  charts: ChartId[];
  cover?: ReportCover;
};

export type ReportLayout = ReportLayoutV1 | ReportLayoutV2;

type FixedPresetId = Exclude<ReportPresetId, "custom">;

const preset = (
  id: FixedPresetId,
  sections: SectionId[],
  charts: ChartId[],
): ReportLayoutV2 => ({
  version: REPORT_LAYOUT_VERSION,
  preset: id,
  sections,
  charts,
});

/** Shared definitions for one-click and audience-specific starting points. */
export const REPORT_PRESETS: Readonly<Record<FixedPresetId, ReportLayoutV2>> = {
  standard: preset(
    "standard",
    REPORT_SECTIONS.map((section) => section.id),
    ["waterfall", "npv_discount", "driver_mix"],
  ),
  executive: preset(
    "executive",
    ["summary", "results", "charts", "risks", "measurement", "audit"],
    ["waterfall", "driver_mix", "hard_capacity"],
  ),
  financial: preset(
    "financial",
    ["summary", "results", "charts", "scenarios", "assumptions", "audit"],
    ["waterfall", "npv_discount", "hard_capacity"],
  ),
};

/** The standard report: every section in page order and three standard charts. */
export const DEFAULT_LAYOUT: ReportLayoutV2 = REPORT_PRESETS.standard;

const SECTION_IDS = new Set<string>(REPORT_SECTIONS.map((s) => s.id));
const CHART_IDS = new Set<string>(REPORT_CHARTS.map((c) => c.id));
const PRESET_IDS = new Set<string>([...Object.keys(REPORT_PRESETS), "custom"]);

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);

const copyCover = (cover?: ReportCover): ReportCover | undefined =>
  cover ? { ...cover } : undefined;

const copyV2 = (layout: ReportLayoutV2): ReportLayoutV2 => ({
  ...layout,
  sections: [...layout.sections],
  charts: [...layout.charts],
  ...(layout.cover ? { cover: copyCover(layout.cover) } : {}),
});

/** Charts stay in their fixed order, and are absent without the Charts section. */
export function normalizeLayout(layout: ReportLayout): ReportLayout {
  const charts = layout.sections.includes("charts")
    ? REPORT_CHARTS.map((chart) => chart.id).filter((id) =>
        layout.charts.includes(id),
      )
    : [];
  if (layout.version === 1)
    return { version: 1, sections: [...layout.sections], charts };
  return {
    ...layout,
    sections: [...layout.sections],
    charts,
    ...(layout.cover ? { cover: copyCover(layout.cover) } : {}),
  };
}

/** The fixed preset matching an exact layout, or custom. */
export function layoutPreset(layout: ReportLayout): ReportPresetId {
  if (layout.version === 2) return layout.preset;
  const normalized = normalizeLayout(layout);
  for (const [id, candidate] of Object.entries(REPORT_PRESETS))
    if (
      sameIds(normalized.sections, candidate.sections) &&
      sameIds(normalized.charts, candidate.charts)
    )
      return id as FixedPresetId;
  return "custom";
}

/** Build a version 2 layout from UI choices, identifying exact presets. */
export function createReportLayout(
  sections: SectionId[],
  charts: ChartId[],
  cover?: ReportCover,
): ReportLayoutV2 {
  const normalized = normalizeLayout({
    version: REPORT_LAYOUT_VERSION,
    preset: "custom",
    sections,
    charts,
    ...(cover ? { cover } : {}),
  }) as ReportLayoutV2;
  const matched = (Object.keys(REPORT_PRESETS) as FixedPresetId[]).find(
    (id) => {
      const candidate = REPORT_PRESETS[id];
      return (
        sameIds(normalized.sections, candidate.sections) &&
        sameIds(normalized.charts, candidate.charts)
      );
    },
  );
  return { ...normalized, preset: matched ?? "custom" };
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
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    return `${what} must be a list of ids.`;
  const ids = value as string[];
  const unknown = ids.find((id) => !known.has(id));
  if (unknown !== undefined)
    return `Unknown ${what.toLowerCase()} id: ${unknown}`;
  if (new Set(ids).size !== ids.length) return `${what} lists an id twice.`;
  return ids;
}

function coverField(
  raw: string | null,
  label: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (raw === null || raw.trim() === "") return { ok: true };
  const value = raw.trim();
  if (/\p{Cc}/u.test(value))
    return { ok: false, error: `${label} contains a control character.` };
  if (Array.from(value).length > MAX_REPORT_COVER_FIELD_LENGTH)
    return {
      ok: false,
      error: `${label} must be ${MAX_REPORT_COVER_FIELD_LENGTH} characters or fewer.`,
    };
  return { ok: true, value };
}

export type ReportLayoutFields = {
  version?: string | null;
  preset?: string | null;
  sections?: string | null;
  charts?: string | null;
  title?: string | null;
  preparedFor?: string | null;
  preparedBy?: string | null;
};

function parsedCover(
  input: ReportLayoutFields,
): { ok: true; cover?: ReportCover } | { ok: false; error: string } {
  const title = coverField(input.title ?? null, "Report title");
  if (!title.ok) return title;
  const preparedFor = coverField(input.preparedFor ?? null, "Prepared for");
  if (!preparedFor.ok) return preparedFor;
  const preparedBy = coverField(input.preparedBy ?? null, "Prepared by");
  if (!preparedBy.ok) return preparedBy;
  const cover: ReportCover = {
    ...(title.value ? { title: title.value } : {}),
    ...(preparedFor.value ? { preparedFor: preparedFor.value } : {}),
    ...(preparedBy.value ? { preparedBy: preparedBy.value } : {}),
  };
  return Object.keys(cover).length ? { ok: true, cover } : { ok: true };
}

function requireSections(sections: SectionId[]): string | null {
  const missing = REQUIRED_REPORT_SECTIONS.find(
    (section) => !sections.includes(section),
  );
  const label = REPORT_SECTIONS.find(
    (section) => section.id === missing,
  )?.label;
  return label ? `${label} is required in every report.` : null;
}

export type ParsedLayout =
  { ok: true; layout: ReportLayoutV2 } | { ok: false; error: string };

function parsedIds(
  sectionsRaw: string,
  chartsRaw: string,
):
  | { ok: true; sections: SectionId[]; charts: ChartId[] }
  | { ok: false; error: string } {
  const sections = idList(sectionsRaw, SECTION_IDS, "Sections");
  if (typeof sections === "string") return { ok: false, error: sections };
  if (sections.length === 0)
    return { ok: false, error: "Choose at least one section." };
  const charts = idList(chartsRaw, CHART_IDS, "Charts");
  if (typeof charts === "string") return { ok: false, error: charts };
  const required = requireSections(sections as SectionId[]);
  if (required) return { ok: false, error: required };
  return {
    ok: true,
    sections: sections as SectionId[],
    charts: charts as ChartId[],
  };
}

/**
 * Parse report action fields. Missing fields mean the standard preset. Legacy
 * section/chart-only submissions remain accepted and are stored as version 2.
 */
export function parseReportLayout(
  input: ReportLayoutFields = {},
): ParsedLayout {
  const version = input.version ?? null;
  const requestedPreset = input.preset ?? null;
  const sectionsRaw = input.sections ?? null;
  const chartsRaw = input.charts ?? null;
  const hasCoverFields =
    input.title != null ||
    input.preparedFor != null ||
    input.preparedBy != null;

  if ((version === null) !== (requestedPreset === null))
    return {
      ok: false,
      error: "Report version and preset must be sent together.",
    };
  if (version !== null && version !== String(REPORT_LAYOUT_VERSION))
    return {
      ok: false,
      error: `Unsupported report layout version: ${version}`,
    };
  if (requestedPreset !== null && !PRESET_IDS.has(requestedPreset))
    return { ok: false, error: `Unknown report preset: ${requestedPreset}` };
  if (version === null && hasCoverFields)
    return {
      ok: false,
      error: "Cover fields require report layout version 2.",
    };

  const cover = parsedCover(input);
  if (!cover.ok) return cover;

  if (
    version === null &&
    sectionsRaw === null &&
    chartsRaw === null &&
    !cover.cover
  )
    return { ok: true, layout: copyV2(DEFAULT_LAYOUT) };

  if (version !== null && requestedPreset !== "custom") {
    const candidate = REPORT_PRESETS[requestedPreset as FixedPresetId];
    if (sectionsRaw === null && chartsRaw === null)
      return {
        ok: true,
        layout: {
          ...copyV2(candidate),
          ...(cover.cover ? { cover: cover.cover } : {}),
        },
      };
    const ids = parsedIds(
      sectionsRaw ?? JSON.stringify(candidate.sections),
      chartsRaw ?? JSON.stringify(candidate.charts),
    );
    if (!ids.ok) return ids;
    const normalized = normalizeLayout({
      version: REPORT_LAYOUT_VERSION,
      preset: requestedPreset as FixedPresetId,
      sections: ids.sections,
      charts: ids.charts,
    });
    if (
      !sameIds(normalized.sections, candidate.sections) ||
      !sameIds(normalized.charts, candidate.charts)
    )
      return {
        ok: false,
        error: `${requestedPreset} preset does not match its shared definition.`,
      };
    return {
      ok: true,
      layout: {
        ...copyV2(candidate),
        ...(cover.cover ? { cover: cover.cover } : {}),
      },
    };
  }

  if (version !== null && (sectionsRaw === null || chartsRaw === null))
    return {
      ok: false,
      error: "Custom reports require sections and charts.",
    };

  const ids = parsedIds(
    sectionsRaw ?? JSON.stringify(DEFAULT_LAYOUT.sections),
    chartsRaw ?? JSON.stringify(DEFAULT_LAYOUT.charts),
  );
  if (!ids.ok) return ids;
  const layout = createReportLayout(ids.sections, ids.charts, cover.cover);
  return {
    ok: true,
    layout:
      requestedPreset === "custom" ? { ...layout, preset: "custom" } : layout,
  };
}

/** A stored versioned/legacy layout, or the standard layout when corrupt. */
export function storedLayout(value: unknown): ReportLayout {
  if (value === null || value === undefined) return copyV2(DEFAULT_LAYOUT);
  const stored = value as {
    version?: unknown;
    preset?: unknown;
    sections?: unknown;
    charts?: unknown;
    cover?: unknown;
  };
  if (!Array.isArray(stored.sections) || !Array.isArray(stored.charts))
    return copyV2(DEFAULT_LAYOUT);

  if (stored.version === REPORT_LAYOUT_VERSION) {
    const cover =
      stored.cover && typeof stored.cover === "object"
        ? (stored.cover as Partial<Record<keyof ReportCover, unknown>>)
        : {};
    const parsed = parseReportLayout({
      version: String(REPORT_LAYOUT_VERSION),
      preset: typeof stored.preset === "string" ? stored.preset : null,
      sections: JSON.stringify(stored.sections),
      charts: JSON.stringify(stored.charts),
      title: typeof cover.title === "string" ? cover.title : null,
      preparedFor:
        typeof cover.preparedFor === "string" ? cover.preparedFor : null,
      preparedBy:
        typeof cover.preparedBy === "string" ? cover.preparedBy : null,
    });
    return parsed.ok ? parsed.layout : copyV2(DEFAULT_LAYOUT);
  }

  if (stored.version !== undefined && stored.version !== 1)
    return copyV2(DEFAULT_LAYOUT);
  const sections = idList(
    JSON.stringify(stored.sections),
    SECTION_IDS,
    "Sections",
  );
  const charts = idList(JSON.stringify(stored.charts), CHART_IDS, "Charts");
  if (
    typeof sections === "string" ||
    typeof charts === "string" ||
    sections.length === 0
  )
    return copyV2(DEFAULT_LAYOUT);
  // Do not impose v2 required sections on historical PDFs.
  return normalizeLayout({
    version: 1,
    sections: sections as SectionId[],
    charts: charts as ChartId[],
  });
}
