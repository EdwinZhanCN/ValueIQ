# ValueIQ per-track research plans (draft v0.1, Nov 4, 2026)

Each file below is research context for one team. Read your file plus this one. Everything is proposed until your team agrees; change what does not fit, but record the change (Team Agreement: no undocumented assumptions).

| File                 | Team               | Issues                 |
| -------------------- | ------------------ | ---------------------- |
| `01-input-team.md`   | Jonathan, Jeremiah | #51-#56, #91, #93, #77 |
| `02-ai-assistant.md` | Eli                | #72-#77, #73, #92-#94  |
| `03-calc-engine.md`  | Ryan, Eli          | #82-#87, #67, #96      |
| `04-output.md`       | Ryan               | #65-#71, #62           |
| `05-infra-db.md`     | Zihao              | #57-#64, #88-#90, #108 |

Companion material (one folder up, `docs/research/`): `ROI.md` (formulas, inputs, tools, confidence gate, output shape), `SOURCES.md` (every source with status), `haircutResearch.md`, `reference/roi_prototype.py` (reference tests, run `python -I roi_prototype.py`). The integration contract is `.agents/exec-plans/active/integration-contract.md` (PR #109).

## The pipeline

```
Input form + upload -> Intake assistant -> Calculation run -> (ask_user) -> Result / gap list -> Report + PDF
```

Cloudflare-native: Workers, D1 (Drizzle), R2, one `ValueIQAgent` Durable Object per project, the run as a Workflow. See PR #109.

## Decisions everyone must respect

1. **Code computes, AI never does arithmetic.** A deterministic TypeScript engine produces every number. Models collect, route, explain. (Q1, decided; Sprint 4 R-03.)
2. **Every input has a tier and backing.** Tiers: `measured`, `documented`, `benchmark`, `estimate`, `assumption`. Backing checks: source file attached, corroborated by a second source, enough coverage (a full cycle or 30+ observations), recent (under 12 months), tight low/high range, verified by a data owner.
3. **Sliding, confidence-based haircut.** Tier gives a band; backing slides within it. Measured = 0%, documented 0-10%, benchmark 10-25% (like-for-like only), estimate 25-40%, assumption 40-60%. Weakest link per driver (max haircut, min confidence). Self-reported time saved is never `measured`. Bands and weights are team judgment bracketed by sources.
4. **Confidence gate.** Confidence per input = 1 minus haircut. A driver enters the headline only if confidence meets its floor (time savings 0.80, data quality 0.80, decision speed 0.85, risk reduction 0.85); the project needs 0.85. If the gate fails, the user sees a **gap list** (what evidence to add), never a low-confidence number. An `estimate`-tier input can never reach the headline (max confidence 0.75).
5. **Hard savings vs capacity value are always separate.** Freed time is capacity value unless a documented spending reduction backs it.
6. **Two ROI figures, labeled:** undiscounted (Sprint 4 spec) and PV-based (Forrester/Priya style, NPV / PV of costs).
7. **The assistant order:** default check, then question cards, then the rest; it asks for backing in the same card as the value; a pre-flight gate shows problems before the run. The run may ask at most 3 blocker questions (`ask_user`) on the loading page.
8. **Unknown is not zero.** Unknown benefits go to `unquantified`; unknown essential costs block the headline.
9. **Stubs are labeled.** Nothing mock is shown as a real assessment.

## Glossary

- **Backing score b (0-1):** weighted yes/no checks (source .25, corroborated .20, coverage .20, recent .10, tight range .15, verified .10). `haircut = band_max - b x (band_max - band_min)`.
- **Capacity value:** value of freed time not turned into cash savings.
- **Gap list:** ranked missing-evidence list shown when the gate fails.
- **Effect input:** the input that carries the benefit's uncertainty (hours saved, error reduction, days saved, event-rate reduction), as opposed to known counts, rates, or costs.

## Key dates

Demo Fri Nov 13. STOP 2 (sign-in, projects, saved form answers) Fri Nov 6. Stub end-to-end run Sat Nov 7. Connect Nov 8-10. Checks Nov 11-12. Reply to your plan's open questions by Thu Nov 5 if you can.

## How to use these plans

Read your plan, check your issue list, flag anything wrong in the team channel, and keep your plan's "Open questions" current. When something you decide changes another team, say so and update the other plan.
