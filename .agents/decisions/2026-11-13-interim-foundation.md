# Decision: Interim foundation — sign-in, teams, project storage, keys and team settings

Status: implemented - Phases 1–5 of the former interim-foundation plan (Z1–Z5, Z7; Q2–Q4, Q13 in #88–#90, #99). Current detail lives in [`docs/architecture.md`](../../docs/architecture.md).

## Problem

ValueIQ needed accounts, teams, saved projects and files before the Input, AI, Math and Output tracks could build on real data. It had to run entirely on Cloudflare (Workers, D1, R2, Durable Objects), keep one team's projects invisible to every other team, and let a team agree on the financial defaults its assessments use without each project re-entering them.

## Decision

- **Identity.** Better Auth with email/password and the organization plugin, on D1 through its Drizzle adapter. A team is a Better Auth organization; its creator is `owner`, everyone else `member` (Q13: no other roles before the demo). "Add people" is our own owner-only action that adds an existing account by email through `auth.api.addMember`; no email is sent. Scrypt hashing costs about 50 ms of CPU per sign-in, which needs the paid Workers plan.
- **One access rule.** `checkProjectAccess` / `requireProjectAccess` in `app/server/access.server.ts`: signed in and a member of the project's team, otherwise a sign-in redirect (signed out) or 404 (another team or no such project, indistinguishable). Every project loader, action and resource route calls it first and gets a row in `scripts/access-matrix.mjs`; the agent gate uses the same core and answers 401/404/403.
- **Storage on Cloudflare only (Q4).** D1 for records; a private R2 bucket per environment (`FILES`), object key `teams/{teamId}/projects/{projectId}/files/{fileId}`. Every upload and download passes through the Worker after the access check. Each file needs a description. Limits: 10 MB per file and 25 MB per project (Q7, #93).
- **The form file is opaque to storage.** `project_forms.form_json` holds the Input team's form (Ag1) as one JSON document; storage never interprets its fields, and the engine validates it at the run boundary.
- **One team-held model key (Q3).** `GEMINI_API_KEY` is a Worker secret per environment. No key screen; the key never reaches the client, a prompt or a log.
- **Team financial defaults (Q2, #88).** `team_settings` is append-only: each change is a new row with value, rationale (required), source, author and `effective_from`. The value in force for a key is its newest row at a given moment; a key without rows uses its starting value (discount 10%, horizon 3 years, recapture 50%, cost uplift 15 / 30 / 50%), so teams created before seeding need no backfill. A new team is seeded with those four rows, author empty. Only the owner may append. Clarify offers the team's discount rate, recapture and horizon as "Team default" (the user still accepts each); the cost uplift goes to the engine as configuration.
- **Runs pin their settings.** A run records `settings_version`: `s1` while the values equal the starting values (the version the engine has always used, so earlier runs stay valid), otherwise the first eight hex digits of a hash of the values. The version is part of the run's idempotency key, so the same form after a settings change gives a new run, not the old result. The workflow rebuilds the engine configuration from the settings in force at the run's start and refuses to run if their version differs from the row's. Review · Assumptions shows the settings a run used.

## Alternatives considered

- **Share links instead of sign-in.** Cut: a link cannot be revoked per person, and the demo needs team membership anyway.
- **Invitation emails.** Rejected for now: they need an email sender and a pending-invite state; adding an existing account by email covers a five-person team. Password reset waits for the same reason.
- **Public or signed R2 URLs.** Rejected: a URL outlives a membership change, and the Worker check keeps one access rule for pages, files and the agent.
- **Per-user or per-project model keys with a key screen (P13).** Rejected: more secrets to leak and nothing the demo needs; one key per environment is enough and stays server-side.
- **Roles beyond `owner | member`** (project owner, finance admin, org admin). Deferred: no flow before the demo depends on them.
- **A `team_goals` table.** Replaced by `team_settings`: goals stay per project in `projects.goals`; what a team shares is its financial defaults.
- **Overwriting a setting in place.** Rejected: a past result must keep showing the values it used, so history is rows, not edits.
- **Hashing the starting values too.** Rejected: every existing run and stored output says `s1`; giving the same values a new version would make unchanged projects re-run and break the output's version check.
- **A settings history screen.** Cut by the design notes: the card shows who changed each value and why; earlier values remain readable through the runs that used them.
- **Auto-filling team defaults into the form.** Rejected: an accepted default is a claim about the project, so the user accepts it, and the form records it as `origin: default` with the team's rationale as its note.
