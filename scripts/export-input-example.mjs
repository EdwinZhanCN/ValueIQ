import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const input = new URL(
  "../docs/research/examples/input-form-v1.ts",
  import.meta.url,
);
const source = await readFile(input, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { exampleForm } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
await writeFile(
  new URL("../docs/research/examples/input-form-v1.json", import.meta.url),
  `${JSON.stringify(exampleForm, null, 2)}\n`,
);
console.log("Exported synthetic input-form-v1.json; no project was saved.");
