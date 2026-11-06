import type { Reporter, TestModule } from "vitest/node";

const NAMES: Record<string, string> = {
  K1: "Reproduces published business cases",
  K2: "Discounting and NPV convention",
  K3: "Driver formulas exact",
  K4: "Determinism",
  K5: "Reconciliation (integrity)",
  K6: "Haircut model properties",
  K7: "Gate safety (0 false releases)",
  K8: "Validation",
  K9: "Traceability",
  K10: "Sensitivity logic",
  K11: "Hard vs capacity separation",
  K12: "Guardrail warnings",
  K13: "Output schema / JSON safety",
  K14: "Agreement with Python oracle",
  K15: "Performance",
  K16: "Tool contracts",
  F1: "File evidence (verified quotes)",
};

interface Count {
  pass: number;
  fail: number;
  skip: number;
}

/** Prints pass/fail per KPI. Tests are tagged by a "Kn" prefix in their describe name. */
export default class KpiReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const stat = new Map<string, Count>();
    const golden: Count = { pass: 0, fail: 0, skip: 0 };
    for (const m of modules) {
      for (const t of m.children.allTests()) {
        const state = t.result().state;
        const key = /\b(?:K\d+|F1)\b/.exec(t.fullName)?.[0];
        let bucket: Count | undefined;
        if (key) {
          bucket = stat.get(key) ?? { pass: 0, fail: 0, skip: 0 };
          stat.set(key, bucket);
        } else if (/golden/i.test(t.fullName)) bucket = golden;
        if (!bucket) continue;
        if (state === "passed") bucket.pass++;
        else if (state === "failed") bucket.fail++;
        else bucket.skip++;
      }
    }
    const verdict = (s?: Count): string => {
      if (!s) return "NOT RUN";
      if (s.fail > 0) return "FAIL";
      if (s.pass === 0) return "SKIPPED";
      return s.skip > 0 ? "PASS (partial)" : "PASS";
    };
    const counts = (s?: Count): string =>
      s ? ` (${s.pass} passed, ${s.fail} failed, ${s.skip} skipped)` : "";
    const lines = ["", "KPI summary (engine-test-plan.md)", "-".repeat(70)];
    for (let k = 1; k <= 16; k++) {
      const key = `K${k}`;
      const s = stat.get(key);
      lines.push(
        `${key.padEnd(5)}${verdict(s).padEnd(16)}${(NAMES[key] ?? "").padEnd(36)}${counts(s)}`,
      );
    }
    {
      const s = stat.get("F1");
      lines.push(
        `${"F1".padEnd(5)}${verdict(s).padEnd(16)}${(NAMES["F1"] ?? "").padEnd(36)}${counts(s)}`,
      );
    }
    lines.push(
      `${"GOLD".padEnd(5)}${verdict(golden).padEnd(16)}${"Golden fixtures".padEnd(36)}${counts(golden)}`,
    );
    console.log(lines.join("\n"));
  }
}
