# Development demo seed

The manual **Seed development demo UI** workflow populates one existing development project with:

- [MOCK-operations-evidence.csv](research/output/MOCK-operations-evidence.csv), with every record marked synthetic.
- A new immutable **STUB** result snapshot using the engine owner's `engine/fixtures/round1/r1-result.json`; its numbers are preserved exactly. Numbers, Show the Math and Charts render this recorded run.
- A generated private PDF and report metadata, so the Report tab and download work too. Every report page carries the STUB label.

Existing saved intake and previous runs are preserved. No model call or real assessment runs. The supplied fixture is explicitly converted to stub mode; it does not claim to represent the project's current saved answers. The demo run pins a synthetic form snapshot in `runs.form_json`. A provenance event records the fixture and mock-upload identity.

Run the workflow on `develop`, supplying the existing project's UUID. GitHub's development environment supplies the existing Cloudflare credential; it needs D1 query/write and R2 object read/write permissions. The script validates the configured development Worker/database/bucket and existing project. Upload/report ownership follows the project creator; descriptions and the GitHub workflow identify administrative seeding.

The R2 file/PDF bytes are read back and verified. The demo run remains pending until result, report and provenance records exist, then becomes released. Failures remove newly created incomplete demo records and their PDF; prior data remains intact. Reruns verify/reuse the same upload and seeded run instead of overwriting or duplicating them. Workflow summaries link directly to the pinned results and report.

All project/file/report URLs require normal application sign-in and team access. There is no public seed endpoint, production target, schema change or runtime secret creation.

Regression checks:

```sh
node --test scripts/seed-demo-upload.test.mjs scripts/seed-demo-output.test.mjs
```

The tests use the actual migrations in SQLite and render a real PDF. They cover STUB publication, unchanged prior data/financial values, idempotency, target isolation, failure cleanup and synthetic labels.
