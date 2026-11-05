# Engine decisions (one line each; simplest reading consistent with ROI.md)

1. Form scalars (`horizon_years`, `discount_rate_pct`, `currency`) are read from the top level of the form, or from an `Input` record of the same id (so a defaulted discount rate can carry its origin and show in `proxies_used`). Missing -> `MISSING_SETTING` error.
2. `adoption_by_year` is an `Input` whose `value` is a `number[]` of percents; length must equal `horizon_years`.
3. Hard savings are only: documented `realized_as_cash` (time savings), or a data-quality / decision-speed benefit when the context input `cost_nature` is `"cash"`. Everything else (capacity value, avoided loss, incremental profit) is in the capacity-inclusive bucket. Hard NPV is `null` ("No documented cash reduction") when there is no hard stream.
4. `realized_as_cash` counts as hard only if its effective tier is measured or documented; capacity value is then reduced by it (`max(0, adjusted - hard)`) so the two never double count. Hard cash is not scaled by adoption (ROI.md 4).
5. Recapture applies to time savings only. A missing `recapture_pct` or `weeks_per_year` drops the driver to unquantified (no hidden default).
6. Decision-speed label: cash -> hard_savings; revenue_deferred -> incremental_profit; risk_exposure -> avoided_loss; otherwise capacity_value.
7. Risk reduction with `cost_bearer = customer` is `customer_benefit`: shown as a driver with share 0, excluded from cash flows, charts and the benefit total.
8. Stated tier `measured` without a same-project file AND `quote_confirmed` (or typed, origin `user`, time savings) is treated as `documented`, with a note; `validate_inputs` refuses typed time savings tagged `measured` (`SELF_REPORTED_MEASURED`). The engine never upgrades a tier by itself.
9. A project's files are the keys of `file_descriptions`; any other `source_file_id` is `FOREIGN_FILE` (error) and fails the source check.
10. Recency uses `meta.generated_at` as "now" (calendar months, UTC), so runs are pure and repeatable. Future dates fail the check.
11. Delay: whole years shift benefits; a part year blends two years linearly; benefits pushed past the horizon are lost; costs are not shifted.
12. Project confidence weights are each driver's undiscounted adjusted total. If no driver passes its floor, the reported project confidence is computed over all quantified drivers (matches the sample gap list).
13. Gate comparisons use a 1e-12 tolerance so exact-floor cases (for example 0.80) pass.
14. Scenarios: conservative = haircuts at band max, adoption x0.85, recapture -10 points; optimistic = band min, adoption x1.10 (capped at 100%), recapture +10 points. Sensitivity: rates 3/5/8/10/12/15, adoption multipliers 0.6/0.8/1.0/1.1, extra haircut 0/5/10/15 points added to each driver (clamped at 99%). All are config values.
15. ROI values are in percent (313.85 means 313.85%). Payback text uses a uniform-flow interpolation ("1.5 years (uniform-flow assumption)").
16. `tier_counts` count the effect inputs (including `realized_as_cash`) of included drivers; known and cost inputs are not counted (matches the samples).
17. Refs: letters A, B, C... follow the order of the selected goals; cost lines use the next letter. A step named `hard_cash` and a final `adjusted` step are added only when cash netting or a delay applies.
18. Waterfall has gross, adoption, recapture, haircut stages (sums over included cash drivers); a fifth "Adjusted benefit" entry appears only when a delay or cash netting changes the total.
19. Cost lines without `basis` use `assumed` (50%) with a warning; `cost_uplift_pct` overrides every line. An unknown optional cost is warned and left out (not zero-filled as a hidden number); an unknown or missing essential cost (`cost_one_time_vendor_license`, `cost_annual_run`) returns a gap list.
20. A gap list item is created per improvement option: attach a source file and confirm the quote (confidence 1.0), or add a second source and a reviewer verification. A missing input item uses confidence-if-added 0.90 (a documented source with no extra backing).
21. Output is either a result or a gap list. Invalid forms throw `EngineValidationError`; a failed integrity check throws `EngineIntegrityError` (contract code ENGINE_INTEGRITY).
22. Guardrail inputs the form does not yet carry: `vendor_supplied` (optional boolean on an `Input`) and the context list `cost_sources` containing `"rework"` (double count with time savings). Input team must add them. The "no unresolved double count" integrity check passes because every detected case is surfaced as a warning.
23. Overrides are always `[]` and `flexibility` is `[]` until the tool layer exists. Measurement plan comes from `form.measurement_plan`, else "Not specified".
24. The Priya headline (NPV about 33,000) is not used; components are tested.
25. Samples: `meta.tier_counts` of `sample-gap-list.json` (1 documented, 2 estimate) cannot come from the single input the sample describes, so the golden test skips that field only.
26. K14 compares the haircut model, finance functions and release gate with `roi_prototype.py` (the prototype has no full-run function). K9 (tool layer part) and K16 are not run: no tool layer yet.
27. Vitest was added as a devDependency (`vitest@5.1.0`); `pnpm test:engine` prints the KPI summary through `engine/tests/kpi-reporter.ts`.
28. No model/Gemini code or model configuration was added: the engine is model-free and Q8 (which models) is still open.
