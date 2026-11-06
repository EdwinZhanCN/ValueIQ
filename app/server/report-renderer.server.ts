import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regular from "../assets/report-regular.ttf?inline";
import bold from "../assets/report-bold.ttf?inline";
import { renderEngineReport } from "../../docs/research/output/pdf-preview/engine-report.mjs";
import type { ResultOutput } from "../../shared/output";

function bytes(dataUrl: string) {
  const content = dataUrl.split(",")[1];
  if (!content) throw new Error("Report font is unavailable");
  return Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
}
export async function renderReport(output: ResultOutput) {
  const report = await renderEngineReport({
    PDFDocument,
    rgb,
    fontkit,
    fonts: { regular: bytes(regular), bold: bytes(bold) },
    data: output,
  });
  return report.bytes;
}
