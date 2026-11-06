import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderPreview } from "./renderer.mjs";
import { renderEngineSample } from "./engine-report.mjs";

const { values } = parseArgs({
  options: {
    runtime: { type: "string" },
    fonts: { type: "string" },
    output: { type: "string" },
    stress: { type: "boolean", default: false },
    sample: { type: "string" },
  },
});
if (!values.runtime || !values.fonts || !values.output) {
  throw new Error(
    "Required: --runtime <temporary dependency directory> --fonts <font directory> --output <PDF path> [--stress]",
  );
}
const require = createRequire(resolve(values.runtime, "package.json"));
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const data = JSON.parse(
  await readFile(
    values.sample ?? new URL("./fixture.json", import.meta.url),
    "utf8",
  ),
);
const result = await (values.sample ? renderEngineSample : renderPreview)({
  PDFDocument,
  rgb,
  fontkit,
  data,
  fonts: {
    regular: await readFile(resolve(values.fonts, "font.ttf")),
    bold: await readFile(resolve(values.fonts, "font-bold.ttf")),
  },
  stress: values.stress,
});
await writeFile(values.output, result.bytes);
await writeFile(
  `${values.output}.layout.json`,
  JSON.stringify(result.layout, null, 2) + "\n",
);
console.log(
  `Generated ${result.pages} pages, ${result.bytes.length} bytes; layout bounds passed.`,
);
