# Deployment

ValueIQ uses GitHub Actions to deploy two Workers in one Cloudflare account. Contributors use local D1 and Durable Objects and need no Cloudflare credentials. The account owner manages billing and provisioning; GitHub controls who can release.

## Team workflow

| Event                                                  | Result                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Work on `feature/*` locally                            | `pnpm dev`, local storage only                                                         |
| Open a PR into `develop`                               | Typecheck, lint, formatting, build, dry run, smoke, and packaging of both environments |
| Merge into `develop`                                   | Repeat checks, then deploy `valueiq-dev`                                               |
| Open and merge a release PR from `develop` into `main` | Repeat checks, then deploy `valueiq-prod`                                              |
| Run Deploy manually on `develop` or `main`             | Release that branch through the same checks                                            |
| Run Deploy manually on another branch or tag           | Checks run, deployment is skipped                                                      |

Use normal merge commits for recurring `develop` → `main` release PRs to preserve shared history. Merge production hotfixes back into `develop`. GitHub Actions is the supported deployment path; do not enable an additional Cloudflare Git build for the same Workers.

## One-time Cloudflare setup

The account owner runs:

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 create valueiq-dev
pnpm exec wrangler d1 create valueiq-prod
```

Confirm the intended account before creating resources. Replace each all-zero `database_id` in [wrangler.jsonc](../wrangler.jsonc) with the corresponding returned ID. IDs are non-secret configuration and should be committed through a PR. Keep the databases separate. The placeholders allow credential-free local checks, but the deployment target check rejects them before any remote mutation.

The two environments explicitly declare their D1 and Durable Object bindings. Each Worker owns its own `ValueIQAgent` namespace; do not add a cross-environment `script_name`. The top-level configuration remains the local-development default. There are no D1 tables or SQL migrations yet, so deployment skips migrations until `drizzle/*.sql` exists. Durable Object class migration `v1` is applied by Worker deployment independently of D1.

Enable your account's Workers subdomain in Cloudflare. The initial URLs are:

- Development: `https://valueiq-dev.<your-subdomain>.workers.dev`
- Production: `https://valueiq-prod.<your-subdomain>.workers.dev`

Create deployment-specific API tokens in Cloudflare, one per environment. Restrict them to the intended account and, where supported, the relevant resources. Worker publishing needs Workers editing permissions; the migration step also needs D1 editing permissions. Start with the Edit Cloudflare Workers template and verify D1 permissions. Separate tokens only provide isolation to the extent their actual permission scopes differ. Do not use a Global API Key or share account login credentials with contributors.

Runtime secrets, such as future model API keys, belong in each Worker's secrets. They are separate from the GitHub deployment credential. Keep local secrets in ignored `.dev.vars` files. The application currently has no runtime secrets.

## One-time GitHub setup

Create `develop` from the agreed starting commit and create two environments under **Settings → Environments**:

| Setting                          | `development`                | `production`                |
| -------------------------------- | ---------------------------- | --------------------------- |
| Allowed deployment branch        | `develop` only               | `main` only                 |
| Secret `CLOUDFLARE_API_TOKEN`    | Development deployment token | Production deployment token |
| Variable `CLOUDFLARE_ACCOUNT_ID` | Your account ID              | Same account ID             |
| Variable `DEPLOY_URL`            | Development HTTPS origin     | Production HTTPS origin     |

`DEPLOY_URL` must be an origin without a path, query, or credentials. It is used for the deployment link and post-deploy HTTP checks. Remove old repository-wide deployment credentials after migrating them to the environments. Missing environment configuration fails the deployment rather than reporting a successful release.

Protect **both** `develop` and `main`: require PRs, one approval, the `verify` status check from the Check workflow, and up-to-date branches; block force pushes and deletion. Select the actual emitted check in GitHub after the first PR run. Limit production merges to the maintainer where available. Require maintainer review for changes to `.github/workflows/`, `wrangler.jsonc`, and deployment scripts (for example, via CODEOWNERS with your real maintainer handle). Workflow-edit access can be used to access credentials; hiding secret values alone is not a permission boundary.

If your plan supports environment required reviewers, add the owner to `production`. Branch review remains necessary even with deployment review. On private repositories, environment secrets and deployment branch policies require an eligible paid GitHub plan; required deployment reviewers have additional restrictions. Verify availability before relying on them. If your plan cannot enforce these controls, use an eligible plan or keep deployment in a separate maintainer-controlled private repository; do not substitute an unrestricted repository secret and assume equivalent protection.

These settings are external to the repository and are **not** created by committing these files.

## Release mechanics

[Check](../.github/workflows/check.yml) runs without Cloudflare credentials, even on fork PRs. [Deploy](../.github/workflows/deploy.yml) calls Check regardless of whether deployment credentials exist. After checks pass, the selected GitHub environment gates the release.

The release installs locked dependencies, generates types, builds the target environment, performs a dry run, and verifies the generated Worker name, D1 target, and Durable Object binding. It then applies D1 migrations, publishes the Worker, and checks `/` and `/workspace` for expected content. Credentials are exposed only to the configuration check and remote-operation steps. The release summary records the commit and URL.

With the Cloudflare Vite plugin, select the environment **at build time**:

```sh
CLOUDFLARE_ENV=development pnpm build
pnpm deploy:check
```

The generated `build/server/wrangler.json` is the deployment configuration. CI explicitly uses it for both remote migrations and publishing; changing an environment flag after building does not retarget the artifact. Never commit generated build files.

Deploy runs are serialized per branch, with in-progress cancellation disabled so a new commit does not interrupt migrations or publishing. GitHub concurrency may replace a pending run with a newer one; it is not a FIFO release queue. Deployments on the two branches can run independently.

## Failures and recovery

A failed check, build, dry run, target validation, or migration prevents publishing. A failed post-deploy check marks the run failed, but the new Worker is already live. These HTTP checks verify availability and recognizable content, not that every request has reached the new revision.

For an application regression, revert the offending change through a PR and redeploy the corrected branch. A maintainer may use Cloudflare's rollback tools for an emergency when the previous Worker remains compatible with the current storage schema. Record the incident and reconcile Git with the live version afterward.

D1 migration success is not undone by a later publish failure or Worker rollback. Introduce backward-compatible schema additions first, migrate usage/data, and remove obsolete fields in a later release. Keep applied SQL and Durable Object migration history unchanged. Test future schema changes locally before release; design a data recovery procedure when real stored data is introduced.

Both URLs currently serve the shared prototype without application authentication. Keep test data in development; deploying this skeleton does not add user authorization or a working assessment backend.

## References

- [Cloudflare Vite environments](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)
- [Wrangler environments and binding inheritance](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [GitHub deployment environments and plan availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
