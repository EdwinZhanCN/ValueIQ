"""ValueIQ ROI reference prototype + tests (oracle for the real engine; Python, stdlib only).
Run:  python -I roi_prototype.py
Mirrors ROI.md sections 2-4 and 11. Band edges, check weights, cost uplifts, floors are
TEAM ASSUMPTIONS (see ROI.md); published fixtures F1, F3, F4, F5 must pass exactly.
"""
from dataclasses import dataclass, field

# ---- haircut model (ROI.md 3.7) -------------------------------------------------
BANDS = {  # tier: (min haircut, max haircut). Non-overlapping so weaker tier never gets less.
    "measured": (0.00, 0.00), "documented": (0.00, 0.10), "benchmark": (0.10, 0.25),
    "estimate": (0.25, 0.40), "assumption": (0.40, 0.60),
}
TIER_ORDER = ["measured", "documented", "benchmark", "estimate", "assumption"]
WEIGHTS = {"source": .25, "corroborated": .20, "coverage": .20, "recent": .10, "tight_range": .15, "verified": .10}
COST_UPLIFT = {"quoted": .15, "estimated": .30, "assumed": .50}  # team judgment; Flyvbjerg mean overrun 27%

def backing_score(checks):
    return sum(w for k, w in WEIGHTS.items() if checks.get(k))

def haircut(tier, checks=None):
    lo, hi = BANDS[tier]
    return hi - backing_score(checks or {}) * (hi - lo)

@dataclass
class Inp:
    name: str; tier: str; checks: dict = field(default_factory=dict)
    @property
    def h(self): return haircut(self.tier, self.checks)
    @property
    def c(self): return 1 - self.h

def driver_haircut(effect_inputs):   # weakest link (decided Nov 4)
    return max(i.h for i in effect_inputs)

def driver_conf(effect_inputs):
    return min(i.c for i in effect_inputs)

FLOORS = {"time_savings": .80, "data_quality": .80, "decision_speed": .85, "risk_reduction": .85}
PROJECT_FLOOR = .85

def gate(drivers):
    """drivers: {name: (goal, benefit, effect_inputs)}. Returns (released, c_p, included, dropped)."""
    inc, drop = {}, {}
    for n, (goal, ben, ins) in drivers.items():
        c = driver_conf(ins)
        (inc if c >= FLOORS[goal] else drop)[n] = (ben, c)
    if not inc: return False, 0.0, inc, drop
    tot = sum(b for b, _ in inc.values())
    cp = sum(b * c for b, c in inc.values()) / tot
    big = [c for b, c in inc.values() if b / tot > .30]
    if big: cp = min(cp, min(big))
    return cp >= PROJECT_FLOOR, cp, inc, drop

# ---- finance (Sprint 4 3.7 / TEI Appendix A) ---------------------------------------
def pv(flows, r):               # flows[0] is Year 1, discounted at end of year
    return sum(v / (1 + r) ** (t + 1) for t, v in enumerate(flows))

def npv(c0, benefits, costs, r):
    return -c0 + pv([b - c for b, c in zip(benefits, costs)], r)

def roi_undiscounted(c0, benefits, costs):
    tc = c0 + sum(costs)
    return None if tc == 0 else 100 * (sum(benefits) - tc) / tc

def roi_pv(c0, benefits, costs, r):          # TEI / Priya style: NPV / PV(costs)
    pvc = c0 + pv(costs, r)
    return None if pvc == 0 else 100 * (pv(benefits, r) - pvc) / pvc

def ale(sle, aro): return sle * aro

# ---- tests ---------------------------------------------------------------------------
RESULTS = []
def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))

def near(a, b, tol): return abs(a - b) <= tol

# F1 Sprint 4 fixture
gross = 10 * 5 * 40 * 50
adj = gross * .5 * .5 * (1 - .20)
check("F1 gross 100000", gross == 100000)
check("F1 adjusted 20000", near(adj, 20000, 1e-9))
check("F1 NPV 1y @10% = 8181.82", near(round(npv(10000, [adj], [0], .10), 2), 8181.82, 0))
check("F1 NPV 1y @3% = 9417.48", near(round(npv(10000, [adj], [0], .03), 2), 9417.48, 0))
# F3 / F4
check("F3 ALE 100000x25%, ARO 3 = 75000", ale(100000 * .25, 3) == 75000)
check("F4 Rule of Ten 62x1 + 38x10 = 442", 62 * 1 + 38 * 10 == 442)
# F5 Forrester TEI single benefit (published)
b = [1279688, 1919531, 2303438]; ra = [round(x * .75) for x in b]
check("F5 risk-adjusted flows", ra == [959766, 1439648, 1727578], str(ra))
check("F5 3yr total 4126992", sum(ra) == 4126992)
check("F5 PV @10% = 3360261", round(pv(ra, .10)) == 3360261, str(round(pv(ra, .10))))
check("F5 inputs 650x15%x5000 = 487500", 650 * .15 * 5000 == 487500)
# F5b TEI ROI is PV based: NPV 9.66M / cost PV 2.44M ~ 394% (within rounding of published millions)
check("F5b TEI ROI ~ NPV/costPV (396 vs 394)", near(9.66 / (12.10 - 9.66) * 100, 394, 3))

# Priya (Sprint 1, illustrative). Components that reproduce exactly:
G = 14 * 5 * 48 * 62
check("Priya gross time 208320", G == 208320)
check("Priya baseline Y1 = gross x 60% adoption = 124992", round(G * .6) == 124992)
check("Priya Y1 recommended = x50% recapture x 95% = 59371", round(G * .6 * .5 * .95) == 59371)
check("Priya expedite 48 x 690 = 33120", (72 - 24) * 690 == 33120)
check("Priya expedite recommended = x0.75 = 24840", round(33120 * .75) == 24840)
check("Priya one-time cost 120000 -> 152400 (27% uplift)", round(120000 * 1.27) == 152400)
check("Priya run cost 18000 -> 22860 (27% uplift)", round(18000 * 1.27) == 22860)
ad = [.6, .85, .9]
time_ = [G * a * .5 * .95 for a in ad]; exp_ = [24840.0] * 3
ben = [t + e for t, e in zip(time_, exp_)]; run = [22860.0] * 3
costpv = 152400 + pv(run, .10)
check("Priya cost PV ~ 209000 (published 'about')", near(costpv, 209000, 2090), f"{costpv:,.0f}")
n = npv(152400, ben, run, .10)
check("Priya NPV ~ 33000 within 10% (published 'about')", near(n, 33000, 3300), f"computed {n:,.0f}  (KNOWN GAP: published Sprint 1 figures are illustrative)")
r1 = roi_pv(152400, ben, run, .10)
check("Priya ROI ~16% (PV-based)", near(r1, 16, 1.6), f"computed {r1:.1f}%; undiscounted would be {roi_undiscounted(152400, ben, run):.1f}%")

# haircut model tests
check("measured is always 0", haircut("measured", {}) == 0 and haircut("measured", {k: True for k in WEIGHTS}) == 0)
allc = {k: True for k in WEIGHTS}
for t in TIER_ORDER:
    lo, hi = BANDS[t]
    check(f"{t}: all checks -> band min", near(haircut(t, allc), lo, 1e-12))
    check(f"{t}: no checks -> band max", near(haircut(t, {}), hi, 1e-12))
for a, bb in zip(TIER_ORDER, TIER_ORDER[1:]):
    check(f"band monotonic {a} <= {bb}", BANDS[a][1] <= BANDS[bb][0] or BANDS[a][1] == BANDS[bb][0])
mono = True
for t in TIER_ORDER:
    base = {}
    for k in WEIGHTS:
        h0 = haircut(t, base); base = {**base, k: True}; mono &= haircut(t, base) <= h0 + 1e-12
check("adding a check never raises the haircut", mono)
check("weighted checks sum to 1", near(sum(WEIGHTS.values()), 1, 1e-12))
check("weakest link = max haircut", near(driver_haircut([Inp("a", "documented", allc), Inp("b", "estimate", {})]), .40, 1e-12))
bench_full = Inp("x", "benchmark", allc); bench_none = Inp("y", "benchmark", {})
check("benchmark fully backed -> 10%, unbacked -> 25%", near(bench_full.h, .10, 1e-12) and near(bench_none.h, .25, 1e-12))

# gate behaviour (floors .80 / .80 / .85 / .85, project .85)
good = Inp("hours", "measured", allc)
priya_time = [Inp("hours saved", "documented", {"source": True, "coverage": True, "recent": True, "tight_range": True, "verified": True})]  # H=4% -> c .96
priya_exp = [Inp("events avoided", "benchmark", {"source": True})]   # H=25%-0.25*15%=21.25% -> c .7875
ok, cp, inc, drop = gate({"time": ("time_savings", 208320 * .285, priya_time), "expedite": ("data_quality", 24840, priya_exp)})
check("gate: weakly backed expedite benefit is dropped (c<.80), time kept", "expedite" in drop and "time" in inc, f"c_expedite={drop['expedite'][1]:.3f}")
check("gate: headline released when only strong driver remains", ok, f"c_p={cp:.3f}")
ok2, cp2, _, drop2 = gate({"risk": ("risk_reduction", 50000, [Inp("aro", "estimate", allc)])})
check("gate: estimate-tier risk driver never passes (max c .75 < .85) -> no headline", (not ok2) and "risk" in drop2)
ok3, _, _, _ = gate({"t": ("time_savings", 1000, [good])})
check("gate: fully measured driver passes with c=1.0", ok3)
check("gate: 'not overdone': measured inputs get zero haircut vs flat 25% (TEI-style)", good.h == 0.0 and 0.25 > good.h)
check("floors: estimate-tier best case c=.75 fails every floor", all(1 - BANDS["estimate"][0] < f for f in FLOORS.values()))
check("floors: benchmark needs b>=1/3 for .80 and b>=2/3 for .85",
      near((0.25 - 0.20) / 0.15, 1 / 3, 1e-9) and near((0.25 - 0.15) / 0.15, 2 / 3, 1e-9))

if __name__ == "__main__":
    bad = 0
    for name, ok, detail in RESULTS:
        print(("PASS " if ok else "FAIL ") + name + (f"   [{detail}]" if detail else ""))
        bad += (not ok)
    print(f"\n{len(RESULTS) - bad}/{len(RESULTS)} passed")
    raise SystemExit(1 if bad else 0)
