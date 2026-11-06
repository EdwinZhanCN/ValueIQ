import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import {
  CHECK_NAMES,
  TIER_ORDER,
  backingScore,
  haircutFor,
  releaseGate,
  type CheckName,
} from "../evidence";
import { npv, roiPv, roiUndiscounted } from "../finance";
import type { DriverId } from "../types";
import { rng } from "./rng";

const script = fileURLToPath(new URL("./oracle_diff.py", import.meta.url));
const oracle = fileURLToPath(
  new URL("../../docs/research/reference/roi_prototype.py", import.meta.url),
);

function hasPython(): boolean {
  const r = spawnSync("python", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}
const rel = (a: number, b: number) =>
  Math.abs(a - b) / Math.max(1, Math.abs(b));

describe("K14 agreement with the Python oracle (second-line evidence, same author)", () => {
  (existsSync(oracle) && hasPython() ? it : it.skip)(
    "1,000+ generated cases agree to 1e-9 (haircut model, finance, release gate)",
    () => {
      const r = rng(14);
      const haircut = Array.from({ length: 1200 }, () => ({
        tier: TIER_ORDER[Math.floor(r() * 5)] as string,
        checks: CHECK_NAMES.filter(() => r() < 0.5),
      }));
      const finance = Array.from({ length: 1200 }, () => {
        const n = 1 + Math.floor(r() * 20);
        return {
          c0: Math.round(r() * 1e5),
          rate: r() * 0.25,
          b: Array.from({ length: n }, () => r() * 1e5),
          c: Array.from({ length: n }, () => r() * 2e4),
        };
      });
      const ids: DriverId[] = [
        "time_savings",
        "data_quality",
        "decision_speed",
        "risk_reduction",
      ];
      const gate = Array.from({ length: 1200 }, () => ({
        drivers: ids
          .filter(() => r() < 0.6)
          .map((id) => ({
            id,
            total: 1 + r() * 1000,
            conf: 0.55 + r() * 0.45,
          })),
      })).filter((g) => g.drivers.length > 0);

      const res = spawnSync("python", ["-I", script, oracle], {
        input: JSON.stringify({ haircut, finance, gate }),
        encoding: "utf8",
        maxBuffer: 1 << 26,
      });
      expect(res.status, res.stderr).toBe(0);
      const py = JSON.parse(res.stdout) as {
        haircut: number[];
        finance: { npv: number; roi_u: number | null; roi_pv: number | null }[];
        gate: {
          released: boolean;
          cp: number;
          included: string[];
          dropped: string[];
        }[];
      };

      haircut.forEach((c, i) => {
        const checks: Partial<Record<CheckName, boolean>> = {};
        for (const k of c.checks) checks[k] = true;
        const ts = haircutFor(
          c.tier as never,
          backingScore(checks, DEFAULT_CONFIG),
          DEFAULT_CONFIG,
        );
        expect(rel(ts, py.haircut[i] as number)).toBeLessThan(1e-9);
      });
      finance.forEach((c, i) => {
        const p = py.finance[i] as {
          npv: number;
          roi_u: number | null;
          roi_pv: number | null;
        };
        const ratePct = c.rate * 100;
        expect(rel(npv(c.c0, c.b, c.c, ratePct), p.npv)).toBeLessThan(1e-9);
        const ru = roiUndiscounted(c.c0, c.b, c.c);
        const rp = roiPv(c.c0, c.b, c.c, ratePct);
        if (p.roi_u === null) expect(ru).toBeNull();
        else expect(rel(ru as number, p.roi_u)).toBeLessThan(1e-9);
        if (p.roi_pv === null) expect(rp).toBeNull();
        else expect(rel(rp as number, p.roi_pv)).toBeLessThan(1e-9);
      });
      gate.forEach((c, i) => {
        const p = py.gate[i] as {
          released: boolean;
          cp: number;
          included: string[];
          dropped: string[];
        };
        const g = releaseGate(
          c.drivers.map((d) => ({
            id: d.id,
            total: d.total,
            confidence: d.conf,
          })),
          DEFAULT_CONFIG,
        );
        // oracle reports cp = 0 when nothing is included; the engine reports it over all drivers
        expect(g.released).toBe(p.released);
        expect([...g.included].sort()).toEqual(p.included);
        expect(g.dropped.map((d) => d.id).sort()).toEqual(p.dropped);
        if (p.included.length > 0)
          expect(rel(g.project_confidence, p.cp)).toBeLessThan(1e-9);
      });
      expect(haircut.length + finance.length + gate.length).toBeGreaterThan(
        1000,
      );
    },
  );
});
