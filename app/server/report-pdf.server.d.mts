import type { PDFDocument, rgb, Fontkit } from "pdf-lib";
import type { ResultOutput } from "../../shared/output";
import type { ChartId, ReportLayout } from "../../shared/report-layout";

export function renderEngineReport(options: {
  PDFDocument: typeof PDFDocument;
  rgb: typeof rgb;
  fontkit: Fontkit;
  fonts: { regular: Uint8Array; bold: Uint8Array };
  data: ResultOutput;
  layout?: ReportLayout;
  projectName?: string;
}): Promise<{
  bytes: Uint8Array;
  pages: number;
  layout: Array<{
    page: number;
    kind: string;
    top: number;
    bottom: number;
    title?: string;
    numericColumns?: number[];
    repeated?: boolean;
  }>;
  sections: string[];
  charts: ChartId[];
}>;

export const renderEngineSample: typeof renderEngineReport;
