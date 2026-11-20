import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regular from "../assets/report-regular.ttf?inline";
import bold from "../assets/report-bold.ttf?inline";
import { renderEngineReport } from "./report-pdf.server.mjs";
import type { ResultOutput } from "../../shared/output";
import type { ReportLayout } from "../../shared/report-layout";

function bytes(dataUrl: string) {
  const content = dataUrl.split(",")[1];
  if (!content) throw new Error("Report font is unavailable");
  return Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
}
export async function renderReport(
  output: ResultOutput,
  layout?: ReportLayout,
  options: { projectName?: string } = {},
) {
  const report = await renderEngineReport({
    PDFDocument,
    rgb,
    fontkit,
    fonts: { regular: bytes(regular), bold: bytes(bold) },
    data: output,
    projectName: options.projectName,
    ...(layout ? { layout } : {}),
  });
  return report.bytes;
}
