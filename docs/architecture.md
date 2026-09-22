# Architecture

ValueIQ is a project value assessment product. A conversation gathers what a project would change and which facts are still missing; deterministic TypeScript turns the confirmed inputs into an explainable estimate; D1 keeps the project, its inputs, and its results after the conversation ends.

## Stack

| Layer      | Choice and wiring                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | React Router v8 in framework mode: `app/routes.ts`, route modules, SSR through `app/entry.server.tsx`                                           |
| Runtime    | Cloudflare Workers through the Cloudflare Vite plugin; `workers/app.ts` is the fetch entry                                                      |
| Data       | D1 through Drizzle ORM: `db/client.ts`, `db/schema.ts`, and the `DB` binding in `wrangler.jsonc`                                                |
| Agent      | Cloudflare Agents SDK: the `ValueIQAgent` Durable Object class, exported from `workers/app.ts`                                                  |
| Styling    | Tailwind CSS v4 with design tokens in `app/styles.css`                                                                                          |
| Components | Vendored shadcn/ui on Base UI primitives (`app/components/ui/`), beUI motion (`app/components/motion/`), Lucide icons, Geist through Fontsource |
| Checks     | `typegen`, `typecheck`, `lint`, `format:check`, `build`, `deploy:check`, `test:smoke`                                                           |

## Surfaces

| Route        | Layout                            | Contents                                                                                    |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `/`          | `app/routes/site-layout.tsx`      | Landing page sections from `app/components/landing/`, wrapped in the site header and footer |
| `/workspace` | `app/routes/workspace-layout.tsx` | The assessment workspace from `app/components/agents/`, given the whole viewport            |

`app/root.tsx` renders the document only: html/body, theme provider, tooltip provider, and the grain overlay. Page chrome belongs to the surface layouts, and error pages bring their own frame.

## Application layer

| Module                    | Responsibility                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| `agents/valueiq-agent.ts` | The `ValueIQAgent` Durable Object that owns a project conversation |
| `db/schema.ts`            | The Drizzle schema, and the source migrations are generated from   |
| `app/context.server.ts`   | Typed Worker bindings for loaders and actions                      |

Keep runtime database and agent access inside `.server.ts` modules or loaders and actions. The SSR build enforces the client/server bundle boundary, so importing server-only code into a component fails the build rather than leaking it to the browser.

## Runtime and generated artifacts

`pnpm dev` uses the Cloudflare Vite plugin to execute SSR and bindings in local workerd. D1 and Durable Object data persist under ignored `.wrangler/state/`. `pnpm build` produces client assets and a server Worker with a generated Wrangler deployment configuration. `pnpm deploy:check` packages that build without publishing it.

`wrangler.jsonc` owns binding declarations: the `DB` D1 database and the `ValueIQAgent` Durable Object. `pnpm typegen` generates runtime/binding types and React Router route types. Drizzle generates migration SQL and snapshots from `db/schema.ts`; Wrangler applies the SQL. Review generated SQL before committing it, and never rewrite a migration that has already been applied.

## Verification

The [check-selection skill](../.agents/skills/valueiq-select-checks/SKILL.md) owns command routing. The smoke test starts the real local Worker and checks that the landing page renders with the site chrome, that the workspace renders fullscreen without it, and that `/projects` is not served. The build and deployment dry run check Worker packaging and the Durable Object binding.

Two boundaries are review-enforced: the interface stays separate from anything backend-shaped, and no page, loader, or placeholder may imply a capability that has not been implemented.
