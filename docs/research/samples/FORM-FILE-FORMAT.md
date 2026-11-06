# Form file format (what the engine receives from the input step)

`sample-result.form.json` is the exact form file the engine takes for the `sample-result` test case. Your form output should look like this.

- One JSON file per project: `version`, `goals`, `currency`, `horizon_years`, `inputs[]`, `file_descriptions`, `other_notes`, `measurement_plan`, `asked`.
- Every number is one entry in `inputs[]`: `id` (from `plans/01a-input-structure.md`), `value`, `tier`, `origin`. Costs add `basis`. Effect inputs add `backing` (`source_file_id`, `quote_confirmed`, `observations`, `period_months`, `source_date`, `verified`, `second_source_value`) and optional `low` / `high`.
- Unknown is `value: null`, never 0. Percentages are 0-100.
- Output: validate against the shared form type before saving, and save as `engine/fixtures/forms/<case-id>.form.json`.

The engine returns either a result or a gap list for this file. Expected output for this case: `sample-result.json`.
