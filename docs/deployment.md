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

## Environments and access

| Environment | Branch    | Worker and D1  | URL                                      |
| ----------- | --------- | -------------- | ---------------------------------------- |
| Development | `develop` | `valueiq-dev`  | <https://valueiq-dev.zhanz.workers.dev>  |
| Production  | `main`    | `valueiq-prod` | <https://valueiq-prod.zhanz.workers.dev> |

Both environments belong to the maintainer’s Cloudflare account. [wrangler.jsonc](../wrangler.jsonc) is the source of truth for resource bindings and non-secret database IDs. The top-level configuration is local-only in the supported workflow. Each deployed Worker owns its own Durable Object namespace; do not add a cross-environment `script_name` or reuse the other environment’s database ID.

GitHub environment branch policies allow only `develop` into development and `main` into production. Each environment contains secret `CLOUDFLARE_API_TOKEN` and variables `CLOUDFLARE_ACCOUNT_ID` and `DEPLOY_URL`. Keep `DEPLOY_URL` synchronized with the deployed HTTPS origin when changing domains. Missing configuration fails a release.

Rotate deployment tokens in Cloudflare and replace the corresponding GitHub environment secrets before revoking the old credentials. Limit tokens to the intended account and required Worker/D1 permissions. Separate tokens isolate access only when their permission scopes differ. Runtime secrets, such as future model API keys, belong to each Worker separately; local secrets belong in ignored `.dev.vars` files.

Contributors submit PRs; protected branches require the `verify` check and up-to-date branches, prohibit force pushes/deletion, and require resolved conversations. Review workflow, deployment script, and resource-binding changes carefully: workflow editing can expose credentials. The account owner retains administrative access. Do not assume repository files alone enforce external GitHub settings.

There are no D1 tables or SQL migrations yet. Deployment skips D1 migrations until `drizzle/*.sql` exists. Durable Object migration `v1` is applied separately by Worker deployment. Generate future D1 migrations from `db/schema.ts`, review and commit the SQL, and test it locally before merging.

## Release mechanics

[Check](../.github/workflows/check.yml) runs without Cloudflare credentials, even on fork PRs. [Deploy](../.github/workflows/deploy.yml) calls Check regardless of whether deployment credentials exist. After checks pass, the selected GitHub environment gates the release.

The release installs locked dependencies, generates types, builds the target environment, performs a dry run, and verifies the generated Worker name, D1 target, and Durable Object binding. It then applies D1 migrations, publishes the Worker, and checks `/` and `/workspace` for expected content. Credentials are exposed only to the configuration check and remote-operation steps. The release summary records the commit and URL.

With the Cloudflare Vite plugin, select the environment **at build time**:

```sh
CLOUDFLARE_ENV=development pnpm build
pnpm deploy:check
```

The generated `build/server/wrangler.json` is the deployment configuration. CI explicitly uses it for both remote migrations and publishing; set `CLOUDFLARE_ENV` only for the build command. Passing it to Wrangler with this flattened config can append the environment suffix again and publish the wrong Worker, so deployment validation rejects it. Never commit generated build files.

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
