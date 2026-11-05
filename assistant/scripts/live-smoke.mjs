// Manual live check (Eli runs this). One function-calling round trip per model.
// Usage: GEMINI_API_KEY=... node assistant/scripts/live-smoke.mjs   (Node 24)
// The key is read from the environment, sent only in the x-goog-api-key header, never printed.

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log(
    "GEMINI_API_KEY is not set. Nothing was called. Set it in your shell and rerun.",
  );
  process.exit(0);
}

const { resolveModels } = await import("../models.ts");
const models = resolveModels(process.env);
const redact = (s) =>
  String(s)
    .split(key)
    .join("[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");

async function roundTrip(label, model) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Call the function get_status once. Do not answer in text." },
        ],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: "get_status",
            description: "Returns the status of the smoke test.",
            parameters: {
              type: "OBJECT",
              properties: { verbose: { type: "BOOLEAN" } },
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: ["get_status"],
      },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  console.log(`[${label}] requested model : ${model}`);
  if (!res.ok) {
    console.log(
      `[${label}] HTTP ${res.status}: ${redact((await res.text()).slice(0, 300))}`,
    );
    return false;
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const fc = parts.find((p) => p.functionCall);
  const u = data.usageMetadata ?? {};
  console.log(
    `[${label}] modelVersion     : ${data.modelVersion ?? "(missing)"}`,
  );
  console.log(`[${label}] matches request  : ${data.modelVersion === model}`);
  console.log(
    `[${label}] function call    : ${fc ? `yes (${fc.functionCall.name})` : "no"}`,
  );
  console.log(
    `[${label}] tokens           : prompt ${u.promptTokenCount ?? "?"}, output ${u.candidatesTokenCount ?? "?"}, total ${u.totalTokenCount ?? "?"}`,
  );
  return data.modelVersion === model && Boolean(fc);
}

let ok = true;
for (const [label, model] of [
  ["assistant", models.assistant],
  ["calc", models.calc],
]) {
  try {
    ok = (await roundTrip(label, model)) && ok;
  } catch (e) {
    console.log(
      `[${label}] failed: ${redact(e instanceof Error ? e.message : e)}`,
    );
    ok = false;
  }
}
console.log(
  ok
    ? "RESULT: both models answered with a function call and the expected modelVersion."
    : "RESULT: check the lines above.",
);
process.exit(ok ? 0 : 1);
