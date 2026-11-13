// The local demo case: a fictional company, Northline Logistics, deciding
// whether to buy an invoice-intake automation tool. Every number comes from
// docs/research/samples/sample-result.form.json, so each expected result is
// already known (sample-result.json). Everything here is SYNTHETIC.

export const CASE = {
  company: "Northline Logistics",
  project: "Invoice intake automation",
  decision:
    "Decide whether to buy an invoice-intake automation tool for accounts payable.",
  goals: ["time_savings", "data_quality", "risk_reduction"],
};

/** What sample-result.json expects for the full form. The loader asserts these. */
export const EXPECTED = {
  npvCapacityInclusive: 127956.73,
  npvHard: -18641.93,
  paybackCapacityYears: 1,
  projectConfidence: 0.935,
  gapConfidence: 0,
};

/**
 * The supporting files. Each one carries a full sentence that contains its
 * number, so a quote can be cited verbatim. `cites` lists the inputs the file
 * backs; `quote` is the citable sentence for the first of them.
 */
export const FILES = {
  brief: {
    name: "SYNTHETIC-project-brief.md",
    mime: "text/markdown",
    description: "Project description",
    cites: ["loaded_hourly_cost", "adoption_by_year"],
    quote:
      "The loaded hourly cost of an accounts payable analyst is 50 dollars.",
  },
  timesheet: {
    name: "SYNTHETIC-timesheet.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description: "AP team weekly time log (synthetic)",
    cites: ["hours_saved_per_staff_week", "staff_affected", "weeks_per_year"],
    quote: "Each analyst saves 5 hours per week in the pilot",
  },
  errors: {
    name: "SYNTHETIC-error-log.csv",
    mime: "text/csv",
    description: "Invoice error log by month (synthetic)",
    cites: ["error_count_before", "error_count_after", "cost_per_error"],
    quote: "The average cost per invoice error is 690 dollars in cash.",
  },
  incidents: {
    name: "SYNTHETIC-incident-register.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    description: "Payment incident register (synthetic)",
    cites: ["aro_before", "aro_after", "loss_per_event"],
    quote: "The average loss per payment incident was 25000 dollars.",
  },
  quote: {
    name: "SYNTHETIC-vendor-quote.pdf",
    mime: "application/pdf",
    description: "Vendor quote, two pages (synthetic)",
    cites: [
      "cost_one_time_vendor_license",
      "cost_training_change",
      "cost_annual_run",
    ],
    quote: "One-time license fee: 30000 USD",
  },
  memo: {
    name: "SYNTHETIC-memo-with-instructions.txt",
    mime: "text/plain",
    description:
      "Memo from finance (synthetic, contains an injected instruction)",
    cites: [] as string[],
    quote: "",
  },
  corrupt: {
    name: "SYNTHETIC-corrupt.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description: "Damaged spreadsheet (synthetic random bytes)",
    cites: [] as string[],
    quote: "",
  },
};

/** The five supporting files a complete project carries. */
export const SUPPORTING: (keyof typeof FILES)[] = [
  "brief",
  "timesheet",
  "errors",
  "incidents",
  "quote",
];

/** Filler files for the 25 MB project limit: random bytes, made at run time. */
export const FILLERS = [
  { name: "SYNTHETIC-filler-10MB-a.bin", mb: 10 },
  { name: "SYNTHETIC-filler-10MB-b.bin", mb: 10 },
  { name: "SYNTHETIC-filler-6MB.bin", mb: 6 },
  { name: "SYNTHETIC-filler-5MB.bin", mb: 5 },
];
