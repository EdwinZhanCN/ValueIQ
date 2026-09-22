# Security Policy

## Supported versions

ValueIQ is pre-release. No release versions are supported yet, and `main` is the only maintained line.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. That opens a private advisory visible only to the maintainers.

Do not open a public issue for a suspected vulnerability.

A useful report includes:

- what you found, and where — file, route, or binding
- the impact you believe it has
- steps to reproduce, if you have them
- any suggested fix

## What to expect

Maintainers will acknowledge a report as soon as they can, and will keep you informed as they assess and address it. Please give the team a reasonable window to ship a fix before disclosing the issue publicly.

## Scope

- There is no authentication and no per-user authorization. Anyone with the URL can reach a deployed instance, so do not put commercially sensitive data in one.
- ValueIQ calls no third-party model or storage service. Project data stays in the deployment's own D1 database.
- Secrets belong in ignored `.dev.vars` locally and in `wrangler secret put` remotely. A committed secret is a valid report.

Dependency advisories are welcome as reports too. If you believe one does not apply here, say so — a clear "not exploitable, because…" is as useful as a fix.
