import { Agent } from "agents";

/**
 * Durable Object shell for the assessment agent.
 *
 * The Agents SDK wiring and the `wrangler.jsonc` class binding stay in place so
 * the runtime is exercised end to end. The agent owns no state shape, no tools,
 * and no RPC methods: none of that is designed yet, and nothing here fabricates
 * a reply.
 */
export class ValueIQAgent extends Agent<Env> {}
