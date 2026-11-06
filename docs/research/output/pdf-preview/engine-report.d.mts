import type { PDFDocument, rgb, Fontkit } from "pdf-lib";
import type { ResultOutput } from "../../../../shared/output";
export function renderEngineReport(options: {
  PDFDocument: typeof PDFDocument;
  rgb: typeof rgb;
  fontkit: Fontkit;
  fonts: { regular: Uint8Array; bold: Uint8Array };
  data: ResultOutput;
}): Promise<{
  bytes: Uint8Array;
  pages: number;
  layout: { page: number; kind: string; top: number; bottom: number }[];
}>;
export const renderEngineSample: typeof renderEngineReport;
