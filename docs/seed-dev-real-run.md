# Seeding a real run on the dev site

`scripts/seed-dev-real-run.mjs` proves the deployed path end to end and leaves a finished demo project to open.

```
node scripts/seed-dev-real-run.mjs [--base https://valueiq-dev.zhanz.workers.dev]
```

It signs up a throwaway user, creates a team and the project "Seed demo: sample result", uploads the four seed files (from `~/Dropbox/Junior/Fall/SDND/seed-files`, or the folder in `SEED_FILES_DIR`), saves the sample form with the real file ids through `POST /projects/:id/form`, then runs `preflight()` and `startRun()` over the agent WebSocket with real Gemini and waits up to 6 minutes. It checks the run is released, that the results page shows the expected headline numbers, and that a second `startRun` returns the same run id. It then makes "Seed demo: gap list" and checks it ends in a gap list with no headline.

The summary lists PASS or FAIL per check, the URLs to open, the throwaway email and password (printed on purpose), and the time per run. It never prints cookies or keys. It exits non-zero on any failure.

Each run creates a new user, team and two projects on the shared dev site and costs about 2 to 3 cents on the team key. Do not run it in a loop.
