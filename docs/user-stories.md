# ValueIQ: Three Core User Stories

These proposed stories cover the essential user journey: understand what information is needed, establish credible assumptions, and obtain an explainable value estimate. To keep each story small and testable, the proposed first release focuses on one staff-productivity assessment for one business process.

Each story follows **Card, Conversation, Confirmation**. Conversation notes are proposals for team discussion; confirmation criteria define observable completion conditions. Each story can be developed and tested using prepared assessment data.

## US-01: Understand What Information to Provide

**Card**

> As a project owner, I want targeted questions about my proposed process improvement so that I know what information to provide for a productivity assessment.

**Conversation**

- Example request: “We want to introduce an AI assistant for our customer support team. Help me assess its productivity value.”
- Questions should establish the current process, proposed change, affected staff, and intended outcome before requesting calculation inputs.
- For each missing input, explain its purpose and suggest a relevant source, such as a staffing record, time study, or pilot report. Users may answer directly, provide supporting excerpts, or mark an answer as unknown.
- Completion means the user has a reviewable assessment brief and a clear list of remaining information needs.
- **Discussion question:** Which terms and questions need examples for a project owner without financial-analysis experience?

**Confirmation**

1. **Given** a request to assess a process improvement, **when** the initial questions are generated, **then** they address the process, proposed change, affected staff, and intended outcome without requesting information already supplied.
2. **Given** a missing calculation input, **when** the system requests it, **then** it explains how the input affects the assessment and identifies a possible source.
3. **Given** the user's answers, **when** the assessment brief is produced, **then** it records the scope and available inputs, including their units, period, currency where applicable, and source or assumption status.
4. **Given** an unknown answer, **when** the brief is produced, **then** that input remains explicitly missing and the brief identifies what evidence would help resolve it.

## US-02: Establish Evidence for a Key Assumption

**Card**

> As a business analyst, I want evidence for an uncertain assessment assumption so that I can judge whether it is reasonable for our business context.

**Conversation**

- Focus on one selected assumption, such as potential time saved per employee per week.
- Research uses the internal materials supplied for the assessment and relevant public web sources. The outcome is an evidence summary for that assumption.
- Internal observations, external benchmarks, and proposed assumptions must remain distinguishable. Explain differences in process, population, or measurement period that affect applicability.
- Completion means the analyst can accept an explicitly labeled assumption, revise it, or identify a specific evidence gap.
- **Discussion question:** What evidence would the team consider sufficient to use an external benchmark as a provisional assumption?

**Confirmation**

1. **Given** an uncertain assumption and accessible internal and public sources, **when** research completes, **then** each supporting claim identifies its source, relevant passage or location, and source date when available.
2. **Given** an external benchmark, **when** it appears in the summary, **then** it is labeled as external evidence and its applicability to the user's process is explained.
3. **Given** conflicting measurements, **when** the summary is produced, **then** the differences remain visible with an explanation of their measurement scope; no replacement value is silently selected.
4. **Given** insufficient evidence or inaccessible sources, **when** research ends, **then** the system states the limitation and identifies the missing evidence without inventing a supported value.

## US-03: Review an Explainable Productivity Estimate

**Card**

> As a project owner, I want a productivity estimate with its supporting assumptions and a visualization so that I can explain the expected benefit when discussing whether to proceed with a pilot.

**Conversation**

- Scope the estimate to one process, one set of assumptions, one currency, and a weekly period.
- Inputs are affected staff, potential hours saved per person per week, hourly staff cost, and the fraction of potential savings expected to be realized.
- The assessment method guides input interpretation; a deterministic calculation tool produces the numbers. The explanation and visualization use those same results.
- Report released staff capacity and its monetary equivalent. Describe this as estimated capacity value, with any actual cash saving requiring separate evidence.
- **Discussion question:** Which explanation would help the target decision-maker distinguish capacity value from a reduction in spending?

**Confirmation**

1. **Given** valid, user-confirmed inputs, **when** an estimate is requested, **then** the result includes weekly hours saved, weekly capacity value, and the currency. For the synthetic fixture of 10 staff, 3 potential hours saved per person per week, USD 40 per hour, and an 80% realization fraction, the result is 24 hours and USD 960 per week.
2. **Given** a completed estimate, **when** the user reviews it, **then** the formula, input values, evidence references or assumption labels, and weekly period are available alongside the result.
3. **Given** a completed estimate, **when** its visualization is generated, **then** the displayed values match the calculation output and clearly identify their units and period.
4. **Given** missing or invalid required inputs, **when** an estimate is requested, **then** the system identifies the specific correction needed and withholds a completed monetary estimate.

---

Writing guide: [User Stories.pdf](</Users/zhanzihao/Downloads/User Stories.pdf>), particularly slides 2-8 (story structure and scope), 14-17 (INVEST), and 21-23 (user-focused, complete outcomes).
