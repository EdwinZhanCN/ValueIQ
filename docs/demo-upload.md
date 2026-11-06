# Development mock upload

The manual **Seed development mock upload** workflow attaches [MOCK-operations-evidence.csv](research/output/MOCK-operations-evidence.csv) to one existing development project. Every record and the upload description identify fictional demonstration data. The workflow does not modify saved intake, runs or results, and does not call a model.

Run the workflow on `develop`, supplying the existing project's UUID. GitHub's development environment supplies the existing Cloudflare credential; it needs D1 query/write and R2 object read/write permissions. The script verifies the configured development Worker/database/bucket, checks the project exists, and writes inside its private team/project namespace. Metadata ownership follows the project creator; the description and GitHub workflow record identify this as an administrative seed, rather than a user-submitted evidence claim.

The R2 bytes are read back and checked before recording metadata. An insertion failure removes the new object. Rerunning verifies and reuses the same mock upload; a changed existing object is never overwritten. Project/file URLs in the workflow summary require normal application sign-in and team access.

Local regression checks: `node --test scripts/seed-demo-upload.test.mjs`. There is no new browser endpoint and no production seed target.
