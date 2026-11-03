> **Archived 2026-11-03. Human reference only.** Superseded by the Interim Demo Release Plan v2 and the ValueIQ Team board. Agents: do not read, cite, or implement from this file.

# Interim Release (Sprint 4 §7.2)

Status: archived - was planning only, 2026-11-03. No contract is frozen yet; Phase 0 freezes them. Course due date is 2026-11-07 (Submitty; demo in the class session before), while the Sprint 4 schedule targets 2026-11-13. Phases are ordered so that each one leaves a demoable build.

Goal: a signed-in user in an organization creates a project, picks a goal, enters or imports evidenced inputs (or resolves unknowns through the assistant), runs a deterministic valuation for productivity, data quality, decision velocity, risk and reliability, and external SaaS, reviews numbers, charts, and show-the-math, edits and recalculates, then approves, shares, and downloads a versioned PDF report. Every figure comes from tested TypeScript, and every requirement in §7.2 maps to code and a test.

Sources: `ValueIQ Sprint 4 Deliverable.pdf` (§1.4 mockups, §2 stories, §3 FURPS+, §3.7 conventions, §5 use cases, §7.2 scope), `Interim Release Deliverables.pdf`, `InterimReleaseRubric.pdf`, and the ValueIQ Mock UI canvas (12 artboards).

## Non-goals (Beta per §7.3; do not build)

- Revenue driver (F-27), PDF/PPT parsing (F-26), evidence research with citations (F-16, UC-07)
- Guardrail warnings for concentration, vendor reliance, and double counting (F-18, US-17). The contribution chart still shows shares, but no warning workflow.
- Stuck-user warning (U-06, US-25), CFM needs-support flags (F-24), data requests (F-25, US-07/08/09)
- Executive sponsor view, projected vs actual results, project comparison, templates, JSON funding export (F-29 to F-32)
- Org-admin refinements beyond provider key and member roles; SSO
- The mock's _Data requests_ and _Compare_ nav items are not rendered.

## Acceptance matrix (requirement → code → evidence)

`U` = Vitest unit test (node), `I` = integration test (Workers pool + local D1), `S` = smoke script, `M` = manual demo check.

| §7.2 bullet / Must req                                                              | Behaviour to prove                                                                                                                                                                                                                                                                                                                   | Owning code                                                                                                      | Evidence                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, orgs (US-23, F-01, UC-01)                                                  | Sign-up creates an org of one; signed-out redirects; other-org and same-org-unauthorized requests reveal nothing; authorized member succeeds                                                                                                                                                                                         | `server/auth.server.ts`, `server/access-policy.ts`, every loader/action, agent connect guard                     | U `AccessPolicy` matrix; I four-actor test per resource (project, file, report PDF, share link); S signed-out redirect                 |
| Project create/select (US-23, F-02)                                                 | Project list with status tabs and step progress; create; open                                                                                                                                                                                                                                                                        | `routes/projects*.tsx`, `ProjectService`                                                                         | I create/list scoped to org; M                                                                                                         |
| Goal routing (US-02, F-02, F-05)                                                    | Two goals give two different question sets; affected-staff/outcome questions come first; unrelated questions skipped                                                                                                                                                                                                                 | `domain/goals.ts` `GoalRouter`, `domain/questions/*`                                                             | U: per-goal plan differs and has the required ordering; U: plan asks for every required field before calculation                       |
| Intake with evidence (US-01, F-03, F-04, U-01)                                      | Every stored input has unit, source, period, tier; -5 h, 105 %, NaN, and text are rejected and the prior value kept; every question has an explanation (quantity, unit, example)                                                                                                                                                     | `domain/inputs.ts` `InputValidator`, `InputDefinition`, `IntakeService`                                          | U boundary table from §3.7; U: every definition has `explanation.{quantity,unit,example}`; I invalid write leaves the D1 row unchanged |
| Unknowns: derive / proxy / exclude (US-03, US-04, F-06, F-15, R-04)                 | Derive only from confirmed inputs, with the formula shown; a proxy comes only from the sourced catalog and is stored as `proxy`/benchmark; excluding removes a counted benefit and lists it as unquantified; missing costs block NPV/ROI/payback; nothing becomes zero silently; an unaccepted suggestion never enters a calculation | `domain/unknowns.ts` (`Derivation`, `ProxyCatalog`), `IntakeService.resolveUnknown`, agent tools                 | U per case; I: an agent-proposed value is absent from the calculation until the user confirms it                                       |
| Hidden drivers (US-03, F-05, F-23)                                                  | Data-migration goal asks about data quality and manual analysis; logistics case shows decision velocity as its own contribution                                                                                                                                                                                                      | `GoalRouter.suggestedDrivers`, driver modules                                                                    | U                                                                                                                                      |
| CSV/XLSX import (US-06, F-17, UC-04)                                                | Preview lists value, sheet/cell, guessed field; unclear numbers are _unmapped_ and not imported; only confirmed rows are saved, with the file as source; an unreadable file leaves inputs intact                                                                                                                                     | `domain/import/*` (`CsvParser`, `XlsxParser`, `CandidateExtractor`, `FieldMatcher`), `ImportService`, R2 `FILES` | U parsers on fixture files; I confirm-subset; I unauthorized download                                                                  |
| Engine (US-10, F-07, F-08, F-09, R-02, R-03)                                        | Ordered steps per driver; ROI/NPV/payback per §3.7; zero cost gives undefined ROI; no payback gives the explicit message; F-09 longer-time case; 100 runs serialize identically                                                                                                                                                      | `domain/engine/*`                                                                                                | U fixtures: §1.4 demo case, zero cost, negative net, disbenefit, no payback, delay, overrun; U determinism                             |
| Hard vs capacity, show-the-math (US-11, US-14, F-10, F-11)                          | Every line carries a category and basis; both bases published; the trace lets a reviewer reproduce every figure                                                                                                                                                                                                                      | `CalculationResult`, `CalculationTrace`, `review.assumptions` route                                              | U: trace replays to the same figure; U US-14 $2,170/week case; M                                                                       |
| Edit, override, review, back nav, progress (US-13, F-12, F-13, R-07, U-02)          | Edit recalculates and highlights changed lines; override needs a reason and keeps the computed value, user, and time; going back loses nothing; the step tracker shows on every step                                                                                                                                                 | `IntakeService.edit`, `OverrideService`, `StepTracker`, routes                                                   | I revision row recorded; I override retains computed value; S/M back-navigation                                                        |
| Numbers vs charts; waterfall, contribution, sensitivity; another view (US-15, F-19) | Charts built from the same `CalculationResult`; extra views come from a fixed catalog; an undrawable request says why                                                                                                                                                                                                                | `domain/charts.ts`, `components/charts/*`                                                                        | U: chart series equal result figures; M                                                                                                |
| Financial defaults (US-21, F-21, S-05)                                              | Finance admin only; §3.7 bounds; haircuts monotonic; versioned with author and effective date; a new calculation uses the latest version; approved reports keep their snapshot; calculation blocked until settings exist                                                                                                             | `domain/policy.ts` `FinancialPolicy`, `SettingsService`                                                          | U bounds and monotonicity; I non-finance write rejected; I approved report unchanged after a settings change                           |
| PDF report (F-20, UC-15)                                                            | Summary, results (both bases), assumptions with tiers, unquantified benefits, audit trail; approve; revision makes v+1                                                                                                                                                                                                               | `ReportService`, `domain/report/ReportBuilder`, `PdfReportRenderer`                                              | U: report model contains every section; I approve and revise; M open the PDF                                                           |
| Published cases within 10 % (R-01)                                                  | Normalized error ≤ 0.10 (absolute ≤ 0.10 when \|v\| < 1)                                                                                                                                                                                                                                                                             | `domain/fixtures/published/*`                                                                                    | U per case. **Blocked on sources (Open decision 2)**                                                                                   |
| Provider key (US-24, F-22)                                                          | Org admin only; key validated by a test call before save; AES-GCM at rest; never returned or logged; provider and model recorded per assessment                                                                                                                                                                                      | `ProviderKeyService`, `KeyCipher`, `ModelProviderFactory`                                                        | I non-admin rejected; I stored row ≠ plaintext; I loader JSON contains no key                                                          |
| Authenticated sharing (F-34, §7.2)                                                  | A share grants one org member read access to one version; sign-in required; revocable; no public access                                                                                                                                                                                                                              | `ReportShareService`, `/reports/:shareId`                                                                        | I four-actor test plus a revoked case                                                                                                  |
| Files private (L-01)                                                                | R2 private bucket, project-scoped keys, authorization before upload/download, deleted with the project                                                                                                                                                                                                                               | `FileRepository`, R2 binding                                                                                     | I                                                                                                                                      |
| S-01, R-03, D-02                                                                    | Each driver is a separate tested module; no arithmetic in agent or UI code                                                                                                                                                                                                                                                           | `domain/drivers/*`; lint rule bans `domain/engine` reimplementation in `app/` and `agents/`                      | U per driver; review rule                                                                                                              |

## Fixed contracts (freeze in Phase 0, record in `.agents/decisions/`)

### Layering

```
app/ (routes, UI)  ─┐
agents/ (ValueIQAgent) ─┼─► server/services/*.server.ts ─► server/repositories/*.server.ts ─► db/schema.ts (D1)
workers/app.ts ────┘            │
                                └─► domain/ (pure TypeScript: no Cloudflare, React, DB, or Date.now)
```

`domain/` is imported by everything and imports nothing outside itself. An ESLint `no-restricted-imports` rule enforces this. Services own authorization and transactions. Repositories own Drizzle queries. The agent and the routes call the same services.

### Domain contract (`domain/`)

```ts
type EvidenceTier =
  "measured" | "estimate" | "benchmark" | "vendor" | "unknown"; // strongest → weakest
type BenefitCategory =
  | "hardSavings"
  | "capacityValue"
  | "incrementalProfit"
  | "avoidedLoss"
  | "customerBenefit";
type InputStatus = "confirmed" | "derived" | "proxy" | "excluded"; // AI suggestions are NOT an InputStatus

interface InputDefinition {
  // one per question; drives forms, agent gaps, import matching
  key: string;
  driverId: DriverId;
  kind:
    "hours" | "minutes" | "count" | "currency" | "percent" | "months" | "rate";
  unit: string;
  required: boolean;
  synonyms: string[];
  explanation: { quantity: string; unit: string; example: string }; // U-01
}
interface InputRecord {
  driverId: DriverId;
  key: string;
  value: number | null;
  unit: string;
  source: string;
  period: "weekly" | "monthly" | "annual" | "one-time";
  tier: EvidenceTier;
  status: InputStatus;
  provenance?:
    | { kind: "file"; fileId: string; cell: string }
    | { kind: "proxy"; catalogId: string; source: string; date: string }
    | { kind: "derivation"; formula: string; from: string[] };
}
interface PolicySnapshot {
  // one immutable settings version
  versionId: string;
  discountRatePct: number;
  horizonYears: number;
  recapturePct: number;
  haircutPct: Record<Exclude<EvidenceTier, "unknown">, number>;
  overrunUpliftPct: number;
  scheduleDelayMonths: number;
  successFactorPct: number | null;
  requiredPaybackMonths: number | null;
  roiThresholdPct: number | null;
  approvalThreshold: number | null;
  demonstration: boolean;
}
interface CaseSnapshot {
  projectId: string;
  currency: string;
  horizonYears: number;
  drivers: DriverId[];
  inputs: InputRecord[];
  overrides: ResultOverride[];
}

interface CalculationResult {
  engineVersion: string;
  formulaVersions: Record<DriverId, string>;
  policyVersionId: string;
  status: "complete" | "blocked";
  blockedBy: { key: string; reason: "missingCost" | "missingSettings" }[];
  lines: BenefitLineResult[]; // per driver line: gross, each stage, adjusted annual, category
  unquantified: { driverId: DriverId; label: string; missing: string[] }[];
  costs: { initial: number; recurringAnnual: number; upliftApplied: number };
  bases: {
    hardFinancial: BasisMetrics;
    capacityInclusive: BasisMetrics;
    customerBenefitAnnual: number;
  };
  contribution: {
    driverId: DriverId;
    amount: number;
    sharePct: number | null;
  }[]; // null when total ≤ 0 (US-16)
  sensitivity: { discountRatePct: number; npv: number }[];
  trace: TraceStep[]; // ordered; replayable
}
interface BasisMetrics {
  cashFlows: { year: number; benefit: number; cost: number; net: number }[];
  npv: number | null;
  roiPct: number | null;
  netBenefit: number;
  paybackMonths: number | null;
  paybackNote: string;
}
interface TraceStep {
  lineId: string;
  stage:
    | "gross"
    | "adoption"
    | "success"
    | "recapture"
    | "haircut"
    | "overrun"
    | "delay"
    | "discount";
  formula: string;
  terms: { label: string; value: number; unit: string; tier?: EvidenceTier }[];
  before: number;
  after: number;
  setting?: string;
}
```

### Object model (shapes the UML and CRC deliverables)

| Class                                                                                                                                                                       | Kind                | Responsibility                                                                                  | Pattern                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ValueDriver` (abstract)                                                                                                                                                    | domain              | `fields()`, `evaluate(inputs)`: returns gross lines or `Unquantified{missing}`; formula version | Template Method (`evaluate` checks required inputs, then calls `gross`) |
| `ProductivityDriver`, `DataQualityDriver`, `DecisionVelocityDriver`, `RiskReliabilityDriver`, `ExternalSaasDriver`                                                          | domain              | One gross-benefit formula each (see below)                                                      | Strategy                                                                |
| `DriverRegistry`                                                                                                                                                            | domain              | Look up drivers by id; list the drivers for a goal                                              | Registry                                                                |
| `GoalRouter`, `QuestionPlanner`                                                                                                                                             | domain              | Goal → drivers and question order; case → next gaps                                             | —                                                                       |
| `InputValidator`                                                                                                                                                            | domain              | §3.7 bounds by `kind`                                                                           | —                                                                       |
| `FinancialPolicy`                                                                                                                                                           | domain value object | Validate a settings draft (bounds, monotonic haircuts); `haircutFor(tier)`                      | Value Object                                                            |
| `ValuationEngine`                                                                                                                                                           | domain              | Orchestrate drivers → adjustment chain → `CashFlowSchedule` → `InvestmentMetrics`               | Facade over a pipeline                                                  |
| `AdjustmentStep` (interface): `AdoptionStep`, `SuccessFactorStep`, `RecaptureStep`, `EvidenceHaircutStep`                                                                   | domain              | Apply one ordered adjustment and emit a `TraceStep`                                             | Chain / Pipeline                                                        |
| `CostModel`, `CashFlowSchedule`, `InvestmentMetrics`, `SensitivityAnalyzer`, `ContributionAnalyzer`                                                                         | domain              | Overrun uplift; delay shifting; NPV/ROI/payback; rate sweep; signed shares                      | —                                                                       |
| `ProxyCatalog`, `Derivation`                                                                                                                                                | domain              | Sourced proxies only; derive from confirmed inputs with the formula                             | —                                                                       |
| `SpreadsheetParser` (abstract): `CsvParser`, `XlsxParser`; `CandidateExtractor`, `FieldMatcher`                                                                             | domain              | File → cells → candidate values with location and guessed field                                 | Template Method + Factory (`ParserFactory.forMime`)                     |
| `ReportBuilder`, `PdfReportRenderer`                                                                                                                                        | domain / server     | Snapshot → report model → PDF bytes                                                             | Builder                                                                 |
| `AccessPolicy`                                                                                                                                                              | server (pure)       | (actor, org role, project role, action) → allow/deny                                            | Policy                                                                  |
| `*Repository` (Project, Input, Calculation, Settings, File, Report, Share, ProviderConfig)                                                                                  | server              | Drizzle persistence                                                                             | Repository                                                              |
| `ProjectService`, `IntakeService`, `ImportService`, `CalculationService`, `OverrideService`, `SettingsService`, `ReportService`, `ReportShareService`, `ProviderKeyService` | server              | Use-case operations: authorize → validate → persist → recalculate → audit                       | Service Layer                                                           |
| `KeyCipher`                                                                                                                                                                 | server              | AES-GCM encrypt/decrypt using the `PROVIDER_KEY_SECRET` Worker secret                           | —                                                                       |
| `ModelProviderFactory`                                                                                                                                                      | server              | Org config → AI SDK `LanguageModel` (OpenAI, Anthropic; Workers AI in development only)         | Factory + Adapter                                                       |
| `ValueIQAgent extends AIChatAgent`                                                                                                                                          | agent               | Conversation per project; tools call services                                                   | —                                                                       |

Two candidate use cases for the sequence diagrams, both non-trivial: **UC-06 resolve unknown via proxy → recalc** (Browser → ValueIQAgent → QuestionPlanner/ProxyCatalog → user accept → IntakeService → CalculationService → ValuationEngine → repositories), and **UC-04 import XLSX → map → confirm** (Browser → ImportService → R2 → ParserFactory/XlsxParser → CandidateExtractor → FieldMatcher → IntakeService). UC-08 _calculate project value_ is the fallback.

### Engine algorithm (per §3.7)

For each benefit line `i` from each included driver:

1. `gross_i` = driver formula (annualized; a one-time benefit stays one-time)
2. `× adoption_i` (a driver input, default required; not a policy default)
3. `× successFactor` only when the policy sets it and the driver opts in
4. `× recapturePct` **only** for `capacityValue` lines
5. `× (1 − haircut(tier_i))`, where `tier_i` is the **weakest tier among the line's quantity inputs**; adjustment percentages are not counted. With the §1.4 demo inputs this gives benchmark 20 %, which matches the mock.
6. Costs: `C0 × (1 + uplift)`, `Ct × (1 + uplift)`
7. Delay `d` months: the benefit in year `t` is `B × max(0, min(12, 12t − d)) / 12`. Recurring costs are not delayed (conservative); this is recorded in the trace.
8. Discount at year end: `NPV = −C0 + Σ (B_t − C_t)/(1+r)^t`. Undiscounted ROI. Payback is the first year where cumulative net ≥ 0, interpolated in months under a stated uniform-flow assumption, else "No payback within the selected horizon".
9. Bases: hard-financial = hardSavings + incrementalProfit + avoidedLoss (org-borne). Capacity-inclusive = hard + capacityValue. customerBenefit is reported separately and never in an org basis.
10. Overrides replace a line's adjusted annual value for dependent totals; the computed value is kept in the result.
11. Full precision internally; half-up rounding (2 dp currency, 1 dp percent) only in `domain/format.ts`.

Demo fixture check (§1.4, must reproduce exactly): 10 × 5 × 40 × $50 = $100,000 → 50 % → 50 % → −20 % = $20,000; C0 $10,000; r 10 %; H 1 gives NPV $8,181.82, ROI 100.0 %, payback 6 months. Hard basis: NPV −$10,000.00, ROI −100.0 %, no payback. Sensitivity: 0 % $10,000.00, 3 % $9,417.48, 5 % $9,047.62, 15 % $7,391.30, 20 % $6,666.67. Gross baseline NPV $80,909.09.

### Driver formulas: proposed, the team must confirm (Open decision 1)

| Driver               | Gross formula                                                                                                                                                                                                                                                   | Category                                                                                              | Required inputs                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Productivity         | `staff × hoursSavedPerWeek × weeksPerYear × loadedHourlyCost`; `hoursSavedPerWeek` derivable via F-09 `((minBefore − minAfter) × tasksPerWeek)/60` (a negative result is a disbenefit labeled "extra time"); optional separately evidenced `cashSpendReduction` | capacityValue (+ hardSavings line for documented spend cuts; the same hours cannot appear in both)    | staff, hours, weeks, cost, adoption                  |
| Data quality         | `recordsPerYear × (baselineErrorRatePct − newErrorRatePct)/100 × costPerError`; `costPerError` split into `reworkMinutes × hourlyCost` (capacity) and `directLossPerError` (avoidedLoss)                                                                        | capacityValue / avoidedLoss                                                                           | volume, both rates, at least one cost part, adoption |
| Decision velocity    | `decisionsPerYear × daysFaster × costOfDelayPerDay`                                                                                                                                                                                                             | avoidedLoss (incrementalProfit if the user marks it revenue-side; Beta revenue driver stays separate) | count, days, cost of delay, adoption                 |
| Risk and reliability | `eventsPerYear × lossPerEvent × reductionPct` with `bearer ∈ {organization, customer}` (mock 04a: "Who bears that cost?")                                                                                                                                       | avoidedLoss or customerBenefit                                                                        | frequency, loss, reduction, bearer, adoption         |
| External SaaS (F-28) | TCO = `subscriptionAnnual + adminHours × hourlyCost + otherRecurring` (Ct) plus `implementation + migration + training` (C0); value = `retiredToolsAnnual` (hardSavings) + optional productivity lines                                                          | costs + hardSavings                                                                                   | subscription, implementation, retired spend          |
| Project costs        | `initialInvestment` (C0), `recurringAnnualCost` (Ct). Missing → headline blocked                                                                                                                                                                                | —                                                                                                     | both, or an explicit 0 confirmed with a source       |

### Persistence (D1 via Drizzle; one migration per phase)

Better Auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) plus:
`settings_versions` (immutable; every field with a rationale/source label, author, effective date, `demonstration` flag) · `provider_configs` (org, provider, model, `key_ciphertext`, `key_iv`, updated_by/at) · `projects` (org, name, goal, decision text, status, currency, horizon, provider/model/adapter version, created_by) · `project_members` (project, user, role ∈ owner/editor/viewer) · `project_drivers` (project, driver, included) · `inputs` (unique project+driver+key; the InputRecord columns) · `input_revisions` (old, new, user, reason, at) · `files` (project, r2_key, name, mime, size, sha256) · `import_candidates` (file, location, label, value, suggested_key, status unmapped/confirmed/rejected) · `calculations` (project, engine/formula versions, settings_version, inputs_hash, result_json, created_by/at) · `result_overrides` (project, line_id, computed, override, reason, user, at) · `report_versions` (project, version, status draft/approved, calculation_id, snapshot_json, approved_by/at) · `report_shares` (report_version, grantee_user, created_by, revoked_at) · `audit_events` (project, actor, type, payload, at).

The agent's conversation lives only in the Durable Object (`AIChatAgent` SQLite); D1 holds no chat. Pending AI suggestions live in DO state and are rendered as cards. Confirming one calls the normal intake action.

### Routes (replace the `/workspace` mock; keep `/`)

`/sign-in`, `/sign-up`, `/api/auth/*` (Better Auth) · `/projects` (tabs: All / In progress / Needs review / Complete) · `/projects/new` · `/projects/:id/intake` (goal, decision, files and import preview) · `/projects/:id/clarify` (chat + inputs panel; manual entry always available) · `/projects/:id/process` (readiness gate: real checklist of resolved inputs, settings present, costs present; runs the calculation; no fake progress) · `/projects/:id/review/{numbers,charts,assumptions}` · `/projects/:id/report` (+ `/:version.pdf` resource route) · `/reports/:shareId` · `/settings` (financial rules, provider, members) · `/agents/*` (WS, guarded in `workers/app.ts` before `routeAgentRequest`). The UI reuses `app/components/ui` and the existing teal tokens; the mock canvas is the layout reference. Every page that shows seeded data carries the mock's "Sample data" badge.

## Execution phases

### Phase 0 - Lock contracts and current state

- Confirm Open decisions 1 to 4 below. Write `.agents/decisions/2026-11-0x-interim-domain-contract.md` (driver formulas, haircut-tier rule, delay rule, bases, rounding) and `…-interim-stack-additions.md` (Better Auth, AI SDK, R2, SheetJS, pdf-lib, Vitest; alternatives rejected).
- Update `docs/architecture.md` and `docs/core-beliefs.md`, whose "no auth / no tables / outside this initialization" statements this release supersedes. Update `AGENTS.md`/CLAUDE.md "keep the shells empty" boundaries, and the smoke test's "`/projects` is not served" assertion.
- Add Vitest (`pnpm test:unit`) to `pnpm check` and CI.
- Exit: `domain/contracts.ts` compiles; the decision records are merged; the baseline `pnpm check` and `pnpm test:smoke` pass.

### Phase 1 - Deterministic engine (no I/O)

- `domain/` modules above, the five drivers plus project costs, `FinancialPolicy`, `InputValidator`, `GoalRouter`/`QuestionPlanner` with all question explanations, `ProxyCatalog`, derivations, contribution, sensitivity, chart series, format.
- Tests: one file per driver (zero, negative/disbenefit, invalid, missing, normal), engine order, metrics edge cases, demo fixture exact, determinism ×100, US-14 $2,170, F-09 longer time, U-01 coverage, published cases (once sourced).
- Exit: every U row in the matrix is green; 100 % branch coverage of `domain/engine` is the target, not a gate.

### Phase 2 - Identity, persistence, settings

- Better Auth (email/password + organization plugin, D1 via Drizzle), personal org on sign-up, org roles `owner | orgAdmin | financeAdmin | member`, project roles. `AccessPolicy` + `requireProjectAccess()` used by every loader, action, resource route, and the agent guard.
- Schema + migration; repositories; `SettingsService` (versioned, finance-admin only, calculation blocked until set); `ProviderKeyService` + `KeyCipher` + secrets `BETTER_AUTH_SECRET`, `PROVIDER_KEY_SECRET` (`.dev.vars.example` updated).
- Seed script `pnpm db:seed:demo`: "Example Org (demonstration)", §1.4 settings labelled demonstration, demo users per role, and the Replenishment automation case. Never run against production.
- Exit: I access matrix and settings tests pass; `pnpm db:generate` is idempotent; smoke covers sign-up → empty project list.

### Phase 3 - Assessment workflow (manual path end to end)

- Projects list/create; intake (goal cards, decision text, driver selection with suggested hidden drivers); clarify page _form side_ (inputs grouped by driver with unit, source, period, tier; Info popover; derive / proxy / exclude controls); process gate; review numbers (gross vs adjusted, status, both bases, edit with changed-line highlight, override with reason); assumptions tab (ordered trace, settings used, inputs with tiers and provenance, unquantified list); step tracker; back navigation.
- Exit: the demo fixture can be entered by hand and reproduces §1.4 figures in the UI; I tests for F-12, F-13, F-14, F-06 pass.

### Phase 4 - Assistant, imports, charts, report

- **Agent**: `ValueIQAgent extends AIChatAgent` (from `agents/ai-chat-agent`; add the `ai`, `@ai-sdk/react`, `zod` peers and the chosen provider packages). The system prompt is built from `QuestionPlanner` gaps for the goal. Tools: `get_case_status`, `propose_input` (creates a suggestion card only), `offer_unknown_options` (derivations + catalog proxies, or exclusion only), `run_calculation` (calls `CalculationService`, returns stored figures), `show_chart` (catalog id). No tool writes a confirmed input. With no provider configured, or on model failure, the chat shows the error with Retry, and the form path stays usable (R-05). Provider, model, and adapter version are recorded on the project.
- **Imports**: upload → R2 (`FILES` binding per env) → `ParserFactory` → candidates table → preview with mapping, unit/period/tier per row → confirm through `IntakeService` (same validation). 10 MB cap.
- **Charts**: SVG components for waterfall, driver contribution (signed shares or n/a), NPV by discount rate, plus catalog views (entered vs adjusted, hard vs capacity, cumulative cash flow). All read `CalculationResult`.
- **Report**: `ReportService.createVersion` snapshots calculation + inputs + settings; approve (blocked while the calculation is `blocked`); revise → v+1; `PdfReportRenderer` (pdf-lib) renders from the snapshot; shares grant one same-org user, revocable.
- Exit: the full demo script below runs on `pnpm dev` with a real provider key and with none.

### Phase 5 - Integration, checks, evidence

- Run `valueiq-select-checks`: `pnpm check`, `pnpm test:unit`, integration tests, `pnpm db:migrate:local`, `pnpm test:smoke`, both env builds and `deploy:check`. Manual browser pass at 1280×720 and 200 % zoom.
- Produce `docs/interim-acceptance.md`: each §7.2 bullet and Must requirement → Implemented / Partial / Missing, with the test names and commands that prove it.
- Update `docs/architecture.md` to the shipped reality; extract decisions; delete this plan when its validation boundaries hold.

### Phase 6 - Course artifacts from the code (separate from the release)

Class diagram (split: domain engine; services and persistence; agent and integration), two sequence diagrams (UC-06, UC-04), CRC cards with cohesion/coupling ratings per class, and the design-approach paragraph (SOLID, patterns above). Generate them from the final source so they match it exactly.

## Demo script (rubric: ≥ 80 % of promised features)

Sign up → personal org · sign in as the demo TPM → projects tabs → new "Replenishment automation", goal Time savings (show a Risk goal giving different questions) → import `time-sample.xlsx`, map the unmapped 40, confirm → clarify with the assistant; enter 105 % (rejected, value kept); "not sure" on hourly cost → proxy from the catalog → accept → process gate → review numbers (both bases), edit hours → highlighted recalculation, override with a reason → charts (waterfall, contribution, sensitivity, ask for "cumulative cash flow") → assumptions trace → report v1 → approve → download PDF → share with the finance user, sign in as them, then revoke → as finance admin change the discount rate: the new calculation uses it, approved v1 is unchanged → as a member, try settings or the key (rejected) → org admin replaces the key (masked).

## Open decisions (need the team; recommendation first)

1. **Driver formulas** for data quality, decision velocity, risk, and SaaS are not specified in Sprint 4. Recommend the table above; confirm with the Requirements document / Sprint 1 drafts before Phase 1 freezes.
2. **Published example cases for R-01 (Must)**: none are named in Sprint 4. Recommend 2 or 3 cases with fully disclosed line-item arithmetic, such as vendor-commissioned TEI-style studies, which publish risk-adjusted benefits, 10 % discounting, and 3-year PV. Transcribe each with source, URL, date, assumptions, and exclusions. Until then R-01 is reported as Partial, never claimed.
3. **Proxy catalog sources**: proxies must carry a real source and date (UC-06 step 4). Recommend 3 to 5 entries the team has verified. Any unverified entry is labelled "demonstration proxy" in the UI and report.
4. **Upload storage**: L-01 requires private object storage, so add R2 buckets `valueiq-dev-files` and `valueiq-prod-files`. A maintainer must create them before deployment. The alternative, parse and discard, violates UC-04 step 2.
5. **Timeline**: the Submitty due date (Nov 7) precedes the scheduled Interim (Nov 13). If that is the binding date, cut order is: provider adapters beyond one (keep Workers AI dev + one external), authenticated sharing UI polish, extra chart catalog views. Never cut the engine, auth isolation, or settings versioning.

## Validation boundaries

- Every row of the acceptance matrix has a passing automated test or an explicit manual check, recorded in `docs/interim-acceptance.md` with the command output date.
- The §1.4 demo case reproduces to the cent in engine tests, review page, charts, and PDF.
- No page, PDF, or chat reply shows a figure that is not in a stored `CalculationResult`; scripted or seeded content is visibly labelled.
- Beta items are absent from navigation and claims.
- `pnpm check`, unit and integration tests, `pnpm test:smoke`, and both environment packages pass in CI.
