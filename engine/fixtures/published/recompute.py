"""Independent recomputation of the published cases in this folder (stdlib only, no I/O).

Run:  python -I engine/fixtures/published/recompute.py
Every number below was typed from the source document named in the matching fixture JSON, then
recomputed here with plain Python so the engine tests are not checked against our own code.
Prints OK or BAD per figure and ends with ALL OK. Where a source prints rounded inputs, the check
uses the tolerance noted next to it.
"""
def pv(f, r=0.10): return sum(x / (1 + r) ** (i + 1) for i, x in enumerate(f))
def chk(name, got, pub, tol):
    ok = abs(got - pub) <= tol
    print(f"{'OK ' if ok else 'BAD'} {name}: computed {got:,.4f} published {pub:,.4f} (tol {tol})")
    return ok
allok = True
def c(*a):
    global allok
    allok &= chk(*a)

print("== Tealium CDP productivity lift (Forrester TEI Jan 2022)")
emp, cost, recap, risk = 12, 120000, 0.80, 0.10
eff = [0.21, 0.23, 0.25]
lift = [emp * e * cost * recap for e in eff]
adj = [x * (1 - risk) for x in lift]
for i, (a, p) in enumerate(zip(adj, [217728, 238464, 259200])): c(f"adj Y{i+1}", a, p, 0.5)
c("total", sum(adj), 715392, 1); c("PV", pv(adj), 589753, 1.5)

print("== Tealium whole study")
b = [2289978, 2983194, 3180330]; k = [501239, 564949, 625784]; c0 = 106122
c("PV benefits", pv(b), 6936676, 1.5); c("PV costs", c0 + pv(k), 1498855, 1.5)
c("NPV", pv(b) - c0 - pv(k), 5437821, 1.5); c("total costs", c0 + sum(k), 1798094, 0); c("total benefits", sum(b), 8453502, 0)

print("== Semarchy (Forrester TEI 2025)")
users = [1500, 3000, 4500]
bt = [u * 48 * 0.6 * 44 * 0.5 for u in users]; btr = [x * 0.9 for x in bt]
for i, (a, p) in enumerate(zip(btr, [855360, 1710720, 2566080])): c(f"business user Y{i+1}", a, p, 0.5)
c("PV business user", pv(btr), 4119352, 1.5)
# Published A4 (FTEs repurposed) is 1.5 / 3.9 / 6.0. 7 x 55% = 3.85, so the printed A2 = 7 is a rounded
# figure (3.9 / 0.55 = 7.09). We therefore start from the published A4 values.
c("steward Y2 FTE from printed A2 (rounded input, 1.5 percent)", 7 * 0.55, 3.9, 0.06)
fte = [1.5, 3.9, 6.0]; stw = [f * 100000 * 0.9 for f in fte]
for i, (a, p) in enumerate(zip(stw, [135000, 351000, 540000])): c(f"steward Y{i+1}", a, p, 0.5)
c("PV steward", pv(stw), 818520, 1.5)
b = [1292985, 2873970, 4220955]; k = [358000, 463000, 673000]; c0 = 406987
c("PV benefits", pv(b), 6721889, 1.5); c("PV costs", c0 + pv(k), 1620720, 1.5)
c("NPV", pv(b) - c0 - pv(k), 5101169, 2.5)
c("ROI pct", 100 * (pv(b) - c0 - pv(k)) / (c0 + pv(k)), 315, 0.5)
c("sum of 4 benefit rows Y1", 135000 + 855360 + 207000 + 95625, 1292985, 0)

print("== Broadcom SES Complete (Forrester TEI, Sept 2025)")
a5 = 4427000 * 0.68 * 0.81
c("A5 exposure", a5, 2438392, 0.5)
ys = [a5 * r * 0.85 for r in (0.70, 0.75, 0.80)]
# The source rounds A5 to 2,438,392 before multiplying, so Year 3 is within $1 (0.71).
for i, (a, p) in enumerate(zip(ys, [1450843, 1554475, 1658107])): c(f"risk-adj Y{i+1}", a, p, 1.0)
c("PV", pv(ys), 3849398, 1.5)
b = [3125286, 3534277, 3735368]; k = [1117338] * 3; c0 = 277440
c("PV benefits", pv(b), 8568496, 1.5); c("PV costs", c0 + pv(k), 3056094, 1.5)
c("NPV", pv(b) - c0 - pv(k), 5512402, 2.5); c("ROI", 100 * (pv(b) - c0 - pv(k)) / (c0 + pv(k)), 180, 0.5)

print("== ThreatLocker (Forrester TEI Feb 2025)")
sub = 0.68 * 0.81 * 0.99 * 3010000
c("A5", sub, 1641329, 1.0)
tot = 1641329 + 2800000 * 0.10
c("At", tot, 1921329, 0); adj = tot * 0.85
c("Atr", adj, 1633130, 1.0); c("total 3y", 3 * 1633130, 4899389, 1.0); c("PV", pv([1633130] * 3), 4061352, 1.5)
c("engine part risk-adjusted", sub * 0.85 + 280000 * 0.85, 1633130, 1.0)

print("== Monte Carlo (Forrester TEI)")
rate = 6e9 / 8760; per_hr = rate * 0.05
c("hourly revenue", rate, 684931.51, 0.01); c("impact per hour", per_hr, 34246.59, 0.02)
hrs = 72 * 0.15 * 2; c("downtime hours", hrs, 21.6, 1e-9)
bt_ = [hrs * 34246.59 * s for s in (0.80, 0.85, 0.90)]
for i, (a, p) in enumerate(zip(bt_, [591781, 628767, 665753])): c(f"Bt Y{i+1}", a, p, 1.0)
btr = [x * 0.8 for x in (591781, 628767, 665753)]
for i, (a, p) in enumerate(zip(btr, [473425, 503014, 532603])): c(f"Btr Y{i+1}", a, p, 1.0)
c("PV", pv([473425, 503014, 532603]), 1246252, 1.5)
# engine style: errors avoided x cost per error
cpe = 2 * per_hr
for i, s in enumerate((0.80, 0.85, 0.90)):
    c(f"engine-style Y{i+1}", (72 * 0.15 - 72 * 0.15 * (1 - s)) * cpe, [591781, 628767, 665753][i], 2.5)

print("== Camunda process quality (Forrester TEI)")
n0 = [475, 455, 420, 360]; o0 = [25, 45, 80, 140]; inst = 328000; r0 = 0.00084
auto = [0.60, 0.66, 0.73, 0.80]
c("weighted error rate", 0.68 * 0.0001 + 0.27 * 0.001 + 0.05 * 0.01, 0.00084, 5e-6)
c("weighted cost per error", 0.68 * 18 + 0.27 * 180 + 0.03 * 1800 + 0.02 * 18000, 475, 0.5)
agg = []
for t in range(4):
    d5 = n0[t] * inst * r0; d7 = r0 * (1 - auto[t]) * 0.95; d8 = o0[t] * inst * d7
    agg.append(d5 + d8)
print("  aggregate errors", [round(x) for x in agg])
# The printed D4/D6 inputs are rounded (for example 66 percent automated), so D9 is within 0.1 percent
# and the avoided errors D10 within 1 percent of the printed values. Fixtures start from printed D9.
for i, p in enumerate([133496, 129347, 121491, 106534]): c(f"D9 Y{i} (rel 0.1 percent)", agg[i], p, p * 0.001)
c("D9 Y0 - D9 Y1 from printed D9", 133496 - 129347, 4149, 0)
c("D9 Y0 - D9 Y2 from printed D9", 133496 - 121491, 12005, 0)
c("D9 Y0 - D9 Y3 from printed D9", 133496 - 106534, 26962, 0)
av = [agg[0] - agg[t] for t in (1, 2, 3)]
for i, p in enumerate([4149, 12005, 26962]): c(f"avoided Y{i+1} (rel 1 percent)", av[i], p, p * 0.01)
dt = [x * 475 for x in (4149, 12005, 26962)]
for i, p in enumerate([1970775, 5702375, 12806950]): c(f"Dt Y{i+1}", dt[i], p, 0)
dtr = [x * 0.9 for x in dt]
for i, p in enumerate([1773698, 5132138, 11526255]): c(f"Dtr Y{i+1}", dtr[i], p, 1.0)
c("3y total", sum(dtr), 18432090, 1.5); c("PV", pv(dtr), 14513734, 1.5)

print("== Thomson Reuters ONESOURCE IDT (Forrester TEI June 2022)")
tax = 5.0e9 * 0.1548; c("A3", tax, 774.0e6, 1)
a5 = tax * 0.03; c("A5", a5, 23220000, 1); a13 = a5 * (1 - 0.9); c("A13", a13, 2322000, 1)
a11 = 3 * 0.20 * 108000 + 129600; c("A11", a11, 194400, 0); a14 = a11 + a13; c("A14", a14, 2516400, 1)
at = [a14 * s for s in (0.2, 0.5, 0.8)]
for i, p in enumerate([503280, 1258200, 2013120]): c(f"At Y{i+1}", at[i], p, 1)
atr = [x * 0.85 for x in at]
for i, p in enumerate([427788, 1069470, 1711152]): c(f"Atr Y{i+1}", atr[i], p, 1)
c("PV", pv(atr), 2558372, 1.5)

print("== Dagster+ Pro faster time to value (Forrester TEI Oct 2024)")
red = [0.25, 0.30, 0.30]; wk = [16 * r for r in red]
for i, p in enumerate([4.0, 4.8, 4.8]): c(f"A3 Y{i+1}", wk[i], p, 1e-9)
a6 = [w * 16 * 10000 for w in wk]; a10 = [w * 8 * 40000 * 0.085 for w in wk]
for i, p in enumerate([640000, 768000, 768000]): c(f"A6 Y{i+1}", a6[i], p, 0.5)
for i, p in enumerate([108800, 130560, 130560]): c(f"A10 Y{i+1}", a10[i], p, 0.5)
atr = [(a + b) * 0.8 for a, b in zip(a6, a10)]
for i, p in enumerate([599040, 718848, 718848]): c(f"Atr Y{i+1}", atr[i], p, 0.5)
c("PV", pv(atr), 1678752, 1.5)

print("== Phenom time to fill (Forrester TEI)")
rates = [23.15, 23.84, 24.56]; pct = [0.10, 0.20, 0.25]
wkc = [1.5 * 40 * r for r in rates]
pubw = [1389, 1430, 1473]
for i in range(3): c(f"weekly vacancy cost Y{i+1}", wkc[i], pubw[i], 1.0)
pub = [4583081, 9441147, 12155477]
vals = []
for i in range(3):
    v = 11000 * (10 * pct[i]) * wkc[i] * 0.30; vals.append(v)
    print(f"  Y{i+1}: {v:,.1f} vs published {pub[i]:,} diff {100*(v-pub[i])/pub[i]:.4f}%")
pubr = [3666465, 7552918, 9724382]
for i in range(3): c(f"risk-adj Y{i+1} (rel 0.05%)", vals[i] * 0.8, pubr[i], pubr[i] * 0.0005)
c("PV published rows", pv(pubr), 16881302, 1.5)
# weekly cost implied
for i in range(3): print(f"  implied weekly cost Y{i+1}: {pub[i]/(11000*10*pct[i]*0.3):.3f}")
print("ALL OK" if allok else "SOME BAD")
