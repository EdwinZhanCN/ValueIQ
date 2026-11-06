# Mock UI

The design reference for every signed-in screen. Copied from the team's [ValueIQ Mock UI canvas](https://claude.ai/artifact/5U6NQ4wZL2tR1kE71VJBfd) on 2026-11-06 (version 1794001331-4d41).

**Which source wins:** the GitHub issue for a task first, then the owner notes below (KEEP / CHANGE / REMOVE), then the screen HTML. The HTML shows layout and look; it contains sample data and features that the notes cut.

The canvas stays the place to edit the design. When it changes, copy `project/*.dc.html` and `project/canvas.json` here again and regenerate the notes below from `canvas.json`.

## View the screens

Open a `*.dc.html` file in a browser. It renders as static HTML: the canvas runtime (`support.js`) and the logo images (`/_blob/…`) are not copied, so the logo is missing and links between screens open the other local file. Review uses `{{ … }}` placeholders for its toggle values.

## Screens

| Screen                                                 | Owner · issues              | App route                                 |
| ------------------------------------------------------ | --------------------------- | ----------------------------------------- |
| [01 Sign in](Main.dc.html)                             | Zihao · Z1                  | `/sign-in`, `/sign-up`                    |
| [02 Projects](Projects.dc.html)                        | Zihao · Z1, Z2              | `/projects`                               |
| [03 Intake + import preview](Intake.dc.html)           | Jonathan, Jeremiah · I4, I5 | `/projects/:id`                           |
| [04 Clarification](Clarify.dc.html)                    | Eli · A3–A5                 | `/projects/:id/clarify`                   |
| [05 Processing](Processing.dc.html)                    | Eli · L1–L3                 | `/projects/:id/process`                   |
| [06 Review · Numbers](Review.dc.html)                  | Ryan · O4, O6, O7           | `/projects/:id/results`                   |
| [06a Assumptions and audit trail](Assumptions.dc.html) | Ryan, Eli · O4 (P7)         | `/projects/:id/results` (Assumptions tab) |
| [06b Visualizations](Charts.dc.html)                   | Ryan · O1, O4               | `/projects/:id/results` (Charts tab)      |
| [07 Final report](Report.dc.html)                      | Ryan + Zihao · O5, Z6       | `/projects/:id/report`                    |
| [08 Data requests](Requests.dc.html)                   | CUT · Beta                  | —                                         |
| [09 Compare, history, templates](Compare.dc.html)      | CUT · Beta                  | —                                         |
| [10 Organization settings](Settings.dc.html)           | Zihao · Z1, Z4, Z5          | `/team`                                   |

## Owner notes

### 01 Sign in

Zihao · Z1

- KEEP: layout, email + password
- CHANGE: "Create a workspace" → sign up + create a team
- REMOVE: company SSO; "Forgot?" (password reset is stretch)

### 02 Projects

Zihao · Z1, Z2

- KEEP: project list, status tabs, step progress, New project
- CHANGE: org switcher → team switcher
- REMOVE: Data requests and Compare nav items

### 03 Intake + import preview

Jonathan, Jeremiah · I4, I5

- KEEP: project name, goal cards, file list
- CHANGE: goals = Time savings, Data quality, Decision speed, Risk reduction; several can be picked
- CHANGE: import preview → one description per file group, plus a project description file (pdf / md / docx)
- REMOVE: Revenue and Software goals; cell → field mapping; Tier column until Q5 says otherwise

### 04 Clarification

Eli · A3–A5

- KEEP: chat beside the inputs panel; question cards
- CHANGE: order: default-value check first ("use industry defaults?"), then cards for gaps
- REMOVE: "Stuck? / Get help"; "Ask someone"

### 05 Processing

Eli · L1–L3

- KEEP: progress ring, step list, "Saved · safe to leave"
- CHANGE: steps → live updates: parsing data, reading plan documents, calculating ROI, finding people affected
- ADD: panel for mid-run questions; error and open-question states

### 06 Review · Numbers

Ryan · O4, O6, O7

- KEEP: headline cards, capacity / hard toggle, gross vs adjusted table, show-the-math buttons
- CHANGE: "Edit inputs" → review page with a back button that keeps answers; sliders are stretch (O7)
- REMOVE: Needs attention, CFM flags, Request evidence

### 06a Assumptions and audit trail

Ryan, Eli · O4 (P7)

- KEEP: ordered calculation steps (show-the-math), inputs table
- CHANGE: Organization settings block → team goals (Q2); source / tier columns depend on Q5
- REMOVE: Flag an assumption

### 06b Visualizations

Ryan · O1, O4

- KEEP: waterfall, NPV by discount rate, driver mix, fixed chart chips
- ADD: choose which charts go in the report
- REMOVE: free-text "Another view" (AI-requested charts are cut); Compare projects

### 07 Final report

Ryan + Zihao · O5, Z6

- KEEP: outline, results table, assumptions, unquantified benefits
- CHANGE: → report builder: choose charts and structure, then download PDF
- REMOVE: share, JSON export, comments; Approve is stretch

### 08 Data requests

CUT · Beta

- REMOVE: whole screen. Do not build for the Interim demo.

### 09 Compare, history, templates

CUT · Beta

- REMOVE: whole screen. Do not build for the Interim demo.

### 10 Organization settings

Zihao · Z1, Z4, Z5

- KEEP: Members → team page (add people by email)
- CHANGE: Financial rules → team goals (Q2)
- REMOVE: settings versioning; Model provider unless Q3 keeps team keys; roles wait for Q13
