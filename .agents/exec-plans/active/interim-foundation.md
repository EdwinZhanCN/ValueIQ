# Interim foundation: sign-in, teams, saved projects, storage

Status: active - 2026-11-05, Q2–Q4 and Q13 answered (#88–#90, #99). Phase 0 freezes the contracts below at STOP 1 (Wed Nov 4 noon). This plan ends at STOP 2 (Fri Nov 6): the Input, AI, Math, and Output tracks build on it. Owner: Zihao. Tracked on the [ValueIQ Team board](https://github.com/users/EdwinZhanCN/projects/7) as Z1–Z5, Z7 (#57–#61, #63) and Q2–Q4, Q13 (#88–#90, #99).

Goal: on `valueiq-dev`, a person signs up with email and password, creates a team, adds teammates by email, creates and opens a project, saves the project's form file, uploads files that each carry a description, signs out, signs back in, and finds everything still there. Signed-out visitors and members of other teams see none of it.

## Non-goals

- Share links (cut: access is by sign-in). A full org settings screen (cut: Phase 5 builds only the owner-only team settings form, Q2).
- Password reset: it needs an email sender. Stretch, after STOP 2.
- Provider-key screen (Q3: one team-held key).
- Roles beyond `owner | member` (Q13: project owner, finance admin, and org admin wait until after the demo).
- Owned by other plans: intake form UI and upload UI (I4, I5), assistant (A*), loading page (L*), engine (M*), output and PDF generation (O*), and connecting the pieces, including run tables and PDF storage (Z6, Z8: [`integration-contract.md`](integration-contract.md)). This plan gives them a route to mount on and a server API to call.

## Fixed contracts (proposed; freeze in Phase 0)

1. **Identity.** Better Auth with email/password and the organization plugin, on D1 through its Drizzle adapter. A team is a Better Auth organization. Creating a team makes the creator `owner`. "Add people" adds an existing account to the team by email; no invitation email is sent. Confirmed 2026-11-05 by a local spike: Better Auth 1.7.17 with the organization plugin and its Drizzle adapter runs in local workerd on D1 under React Router 8.3.1, and the Worker packages with `deploy:check`. Its scrypt password hashing takes about 50 ms of CPU per sign-up or sign-in. That fits the paid Workers plan this account uses, but not the free plan's 10 ms limit. The first sign-up on `valueiq-dev` (Phase 4) confirms it deployed.
2. **Access rule.** One server function, `requireProjectAccess(request, projectId)` in `app/server/access.server.ts`: the caller must be signed in and a member of the project's team, or the response is a redirect to `/sign-in` (signed out) or 404 (any other team). Every loader, action, and resource route that touches a project calls it. Its core, `checkProjectAccess(request, projectId)` in the same module, returns `{ userId, role }` or `signed_out` / `forbidden` without building a response; the agent connect path calls that and answers 401 or 404 (see [`integration-contract.md`](integration-contract.md) section 7).
3. **Tables (Ag6, designed with Jonathan and Jeremiah after their I3 field list).** Better Auth's tables, plus:
   - `projects`: id, team_id, name, goals (JSON array), created_by, created_at, updated_at.
   - `project_forms`: project_id (PK), form_json (TEXT), updated_by, updated_at. The form file is stored opaquely; its shape is Ag1 and belongs to the Input team.
   - `files`: id, project_id, r2_key, name, mime, size, description (required), uploaded_by, uploaded_at.
   - `team_settings` (Q2, replaces `team_goals`): id, team_id, key, value_json, rationale, source, set_by, effective_from. The team's financial defaults only (discount rate, horizon, recapture, cost-uplift tiers); ROI goals stay per project in `projects.goals`. Append-only: the newest row per key is in force, and a run pins the settings it used through `settings_version` (see [`integration-contract.md`](integration-contract.md) section 4).
4. **Storage (Q4, decided: everything on Cloudflare).** D1 for records; a private R2 bucket per environment (`FILES` binding: `valueiq-dev-files`, `valueiq-prod-files`, local in dev). Object key `teams/{teamId}/projects/{projectId}/files/{fileId}`. Uploads and downloads pass through the Worker after the access check; no public bucket URLs. Default cap 10 MB per file until Q7 sets limits.
5. **Model keys (Q3, decided).** One team-held Gemini key per environment as Worker secret `GEMINI_API_KEY`, separate for development and production; no key screen, P13 not shown. The key never reaches the client or a prompt.
6. **Server API for other tracks.** `app/server/projects.server.ts` exposes `getProjectForm(projectId)`, `saveProjectForm(projectId, json, userId)`, `listProjectFiles(projectId)`, and `readProjectFile(fileId, projectId)` (re-exported from `files.server.ts`; null unless the file is in that project, so a file id from another project cannot be read through an authorized one). Callers authorize first with `requireProjectAccess`.
7. **Routes.** `/sign-up`, `/sign-in`, `/api/auth/*`, `/teams/new`, `/team` (members, add-by-email, and team settings; only the owner edits), `/projects`, `/projects/new`, `/projects/:id` (the shell the intake form mounts into), `/projects/:id/files/:fileId` (download). `/` stays. `/workspace` stays a labelled mock until the real flow replaces it.

## Execution phases

### Phase 0 - Lock contracts (to Wed Nov 4 noon, STOP 1)

- Answered Nov 5: Q4 (all storage on Cloudflare, #90), Q3 (team-held key, #89), Q13 (`owner | member`, #99), Q2 (team settings, #88).
- Design the tables with the Input team once I3 gives the field list (Ag6).
- Exit: Q2–Q4 and Q13 are closed on the board or explicitly deferred with a default.

### Phase 1 - Sign-up and teams (Z1)

- Add Better Auth; schema plus the first migration; `BETTER_AUTH_SECRET` in `.dev.vars.example` and as a Worker secret per environment.
- Sign-up, sign-in, sign-out; create a team; add a member by email; team page lists members.
- "Add people" is our own action: it checks that the caller is the owner, looks up the account by email, then calls `auth.api.addMember`; Better Auth has no HTTP endpoint for it. Better Auth rejects a POST without a matching `Origin`, so the smoke test sends one. Pin a Better Auth release old enough to pass pnpm's minimum release age; do not add `minimumReleaseAgeExclude` entries for it.
- In the same PR, lift the boundaries this replaces: `AGENTS.md` (routes and "keep the shells empty"), `docs/architecture.md`, `docs/core-beliefs.md` (authentication was out of scope), `docs/deployment.md` ("no application authentication"), and the smoke assertion that `/projects` returns 404.
- Exit: locally, two accounts in two teams; adding a member by email works; smoke covers sign-up and reaching an empty `/projects`.

### Phase 2 - Projects and the saved form (Z2)

- `projects` and `project_forms`; list, create, open; save and load the form JSON through an action; `requireProjectAccess` everywhere.
- Exit: the four-actor check passes for `/projects/:id` and the save action: signed out → `/sign-in`, other team → 404, team member → allowed, owner → allowed.

### Phase 3 - File storage (Z3)

- `FILES` R2 binding in `wrangler.jsonc` (local, development, production); `files` table; upload action that requires a description; download resource route; delete objects with their project.
- Exit: upload/download round trip locally; another team's download returns 404; an upload without a description is rejected.

### Phase 4 - Online for the team (Z7, Fri Nov 6, STOP 2)

- Maintainer creates both R2 buckets and sets `BETTER_AUTH_SECRET` and `GEMINI_API_KEY` on each Worker. Merge to `develop`; the deploy workflow applies migrations.
- Exit: all five teammates sign up on `valueiq-dev`, join one team, and each can create a project and upload a file.

### Phase 5 - Team settings (Z4, Sat Nov 7)

- `team_settings` table. A new team is seeded with the starting defaults (discount rate 10%, horizon 3 years, recapture 50%, cost-uplift tiers 15 / 30 / 50%), each labeled as a proxy with its source.
- Owner-only edit form on `/team`; each change appends a row with rationale and source. Projects read the settings in force.
- Exit: a setting changed once at team level appears in a new project without re-entry; a member cannot change it.
- On completion, extract the rationale (Better Auth, team = organization, R2, key handling, rejected alternatives) into `.agents/decisions/` and update `docs/architecture.md` before deleting this plan.

## Validation boundaries

- On `valueiq-dev`: sign up, create a team, add a teammate, create a project, save a form, upload a described file, sign out and in, and everything is still there.
- The access matrix (signed out, other team, team member, owner) holds for project pages, the form save action, and file download, checked by an automated script that the select-checks skill routes to.
- `pnpm db:generate` produces no diff after the committed migration; `valueiq-select-checks` passes for the changed areas.
- No page shows seeded or mock data as a real project; `/workspace` stays labelled as a mock.
