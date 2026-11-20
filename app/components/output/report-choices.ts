import { useCallback, useEffect, useState } from "react";

/**
 * What the user picked for the report: which fixed charts go in, and which
 * sections, in what order. Kept per browser (localStorage) for the pinned run;
 * it is a viewing preference, not assessment data.
 */
export {
  DEFAULT_LAYOUT,
  REPORT_CHARTS,
  REPORT_SECTIONS,
  REQUIRED_REPORT_SECTIONS,
  type ChartId,
  type SectionId,
} from "../../../shared/report-layout";
import {
  DEFAULT_LAYOUT,
  REPORT_CHARTS,
  REPORT_SECTIONS,
  REQUIRED_REPORT_SECTIONS,
  type ChartId,
  type SectionId,
} from "../../../shared/report-layout";

export type ReportChoices = {
  charts: ChartId[];
  sections: { id: SectionId; on: boolean }[];
};

export const DEFAULT_CHOICES: ReportChoices = {
  charts: [...DEFAULT_LAYOUT.charts],
  sections: REPORT_SECTIONS.map((section) => ({
    id: section.id,
    on: DEFAULT_LAYOUT.sections.includes(section.id),
  })),
};

const chartIds = new Set<string>(REPORT_CHARTS.map((chart) => chart.id));
const sectionIds = new Set<string>(REPORT_SECTIONS.map((s) => s.id));

/** Lenient: unknown ids are dropped, missing sections are appended (on). */
export function parseChoices(raw: string | null): ReportChoices {
  if (!raw) return DEFAULT_CHOICES;
  try {
    const value = JSON.parse(raw) as Partial<ReportChoices>;
    const charts = Array.isArray(value.charts)
      ? value.charts.filter((id): id is ChartId => chartIds.has(id))
      : DEFAULT_CHOICES.charts;
    const seen = new Set<string>();
    const sections = (Array.isArray(value.sections) ? value.sections : [])
      .filter(
        (s): s is { id: SectionId; on: boolean } =>
          !!s && sectionIds.has(s.id) && !seen.has(s.id) && !!seen.add(s.id),
      )
      .map((s) => ({
        id: s.id,
        on: REQUIRED_REPORT_SECTIONS.includes(
          s.id as (typeof REQUIRED_REPORT_SECTIONS)[number],
        )
          ? true
          : s.on !== false,
      }));
    for (const s of REPORT_SECTIONS)
      if (!seen.has(s.id)) sections.push({ id: s.id, on: true });
    return { charts: [...new Set(charts)], sections };
  } catch {
    return DEFAULT_CHOICES;
  }
}

export const choicesKey = (projectId: string | undefined, runId: string) =>
  `valueiq.report.${projectId ?? "sample"}.${runId}`;

export function useReportChoices(key: string) {
  const [choices, setChoices] = useState<ReportChoices>(DEFAULT_CHOICES);
  useEffect(() => {
    try {
      setChoices(parseChoices(window.localStorage.getItem(key)));
    } catch {
      setChoices(DEFAULT_CHOICES);
    }
  }, [key]);
  const update = useCallback(
    (change: (current: ReportChoices) => ReportChoices) =>
      setChoices((current) => {
        const next = change(current);
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private mode); the choice still applies
          // for this page view.
        }
        return next;
      }),
    [key],
  );
  const toggleChart = useCallback(
    (id: ChartId) =>
      update((current) => ({
        ...current,
        charts: current.charts.includes(id)
          ? current.charts.filter((chart) => chart !== id)
          : [...current.charts, id],
      })),
    [update],
  );
  return { choices, update, toggleChart };
}
