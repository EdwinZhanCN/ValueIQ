import type { Route } from "./+types/workspace";
import { ChatAppExample } from "../components/agents/chat-app-example";

export const meta: Route.MetaFunction = () => [
  { title: "Workspace · ValueIQ" },
  {
    name: "description",
    content:
      "ValueIQ workspace interface: a UI skeleton for project assessment conversations.",
  },
];

/**
 * The workspace surface. It renders the interface skeleton only — no loader,
 * no action, and no project or assessment data. Connecting this view to the
 * agent and D1 backend is planned work, not wired here.
 */
export default function Workspace() {
  return <ChatAppExample className="h-full rounded-none border-0" />;
}
