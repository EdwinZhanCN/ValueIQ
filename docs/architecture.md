# Architecture

ValueIQ is a technology-stack skeleton for a project value assessment product. What exists is the chosen stack, wired end to end, plus two interface surfaces. What does not exist is the application design: no database tables, no agent state, no agent tools, and no shared domain types have been decided, and nothing in the repository pretends otherwise.

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
| `/workspace` | `app/routes/workspace-layout.tsx` | The interface skeleton from `app/components/agents/`, given the whole viewport              |

`app/root.tsx` renders the document only: html/body, theme provider, tooltip provider, and the grain overlay. Page chrome belongs to the surface layouts, and error pages bring their own frame.

Neither surface has a loader or an action. `/workspace` renders example content owned by vendored components; it is a mock interface, not a working assessment, and it calls nothing.

## Empty shells

The application layer is structure without behaviour, and nothing fabricates a result:

- `agents/valueiq-agent.ts` — an empty `ValueIQAgent` Durable Object: no state shape, no tools, no RPC methods.
- `db/schema.ts` — the Drizzle entry point with no tables, so `drizzle/` holds no migrations yet.
- `app/context.server.ts` — typed Worker bindings, ready for the first loader or action.

Undecided on purpose: the D1 data model, agent state, agent tools, application skill conventions, and every shared domain type. Add them when the design is settled, generate migrations from `db/schema.ts`, and reconnect a surface to them deliberately.

## Runtime and generated artifacts

`pnpm dev` uses the Cloudflare Vite plugin to execute SSR and bindings in local workerd. D1 and Durable Object data persist under ignored `.wrangler/state/`. `pnpm build` produces client assets and a server Worker with a generated Wrangler deployment configuration. `pnpm deploy:check` packages that build without publishing it.

`wrangler.jsonc` owns binding declarations: the `DB` D1 database and the `ValueIQAgent` Durable Object. `pnpm typegen` generates runtime/binding types and React Router route types. Drizzle generates migration SQL and snapshots from `db/schema.ts`; Wrangler applies the SQL. Remote resource setup belongs in the README.

There are no model secrets, outbound model calls, MCP integrations, queues, or separate backend. No authentication or per-user authorization exists: a deployed instance is a shared prototype.

## Verification boundaries

The [check-selection skill](../.agents/skills/valueiq-select-checks/SKILL.md) owns command routing. There are no unit tests while the repository holds no calculation contracts. The smoke test starts the real local Worker and checks that the landing page renders with the site chrome, that the workspace renders fullscreen without it, and that `/projects` is not served. The build and deployment dry run check Worker packaging and the Durable Object binding.

Two boundaries are review-enforced: the interface stays separate from anything backend-shaped, and an empty shell stays empty. A page, a loader, or a mock must not start implying a design that has not been made.
