import type { PDFDocument, rgb, Fontkit } from "pdf-lib";
import type { ResultOutput } from "../../../../shared/output";
import type { ChartId, ReportLayout } from "../../../../shared/report-layout";
export function renderEngineReport(options: {
  PDFDocument: typeof PDFDocument;
  rgb: typeof rgb;
  fontkit: Fontkit;
  fonts: { regular: Uint8Array; bold: Uint8Array };
  data: ResultOutput;
  /** Sections, order and charts; the default layout when omitted. */
  layout?: ReportLayout;
}): Promise<{
  bytes: Uint8Array;
  pages: number;
  layout: { page: number; kind: string; top: number; bottom: number }[];
  /** The numbered section titles, in the order printed. */
  sections: string[];
  /** The charts drawn, in order. */
  charts: ChartId[];
}>;
export const renderEngineSample: typeof renderEngineReport;
