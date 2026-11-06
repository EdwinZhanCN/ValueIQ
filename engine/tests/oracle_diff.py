"""Differential oracle for K14. Reads JSON cases on stdin, answers with roi_prototype.py results.
Usage: python -I oracle_diff.py <path to docs/research/reference/roi_prototype.py>
Covers what the prototype implements: haircut model, finance (pv/npv/roi) and the release gate.
"""
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("roi_prototype", sys.argv[1])
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)

cases = json.load(sys.stdin)
out = {"haircut": [], "finance": [], "gate": []}
for c in cases["haircut"]:
    out["haircut"].append(rp.haircut(c["tier"], {k: True for k in c["checks"]}))
for c in cases["finance"]:
    r = c["rate"]
    out["finance"].append(
        {
            "npv": rp.npv(c["c0"], c["b"], c["c"], r),
            "roi_u": rp.roi_undiscounted(c["c0"], c["b"], c["c"]),
            "roi_pv": rp.roi_pv(c["c0"], c["b"], c["c"], r),
        }
    )
for c in cases["gate"]:
    drivers = {}
    for d in c["drivers"]:
        # one effect input per driver whose confidence is d["conf"]: use a synthetic input
        inp = rp.Inp(d["id"], "documented", {})
        inp.__class__ = type("Fixed", (rp.Inp,), {"h": 1 - d["conf"], "c": d["conf"]})
        drivers[d["id"]] = (d["id"], d["total"], [inp])
    ok, cp, inc, drop = rp.gate(drivers)
    out["gate"].append({"released": ok, "cp": cp, "included": sorted(inc), "dropped": sorted(drop)})
json.dump(out, sys.stdout)
