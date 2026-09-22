import type { Route } from "./+types/workspace";
import { ChatAppExample } from "../components/agents/chat-app-example";

export const meta: Route.MetaFunction = () => [
  { title: "Workspace · ValueIQ" },
  {
    name: "description",
    content:
      "Assess what a project is worth: describe the change, supply the facts, and read the estimate with its inputs and formulas.",
  },
];

/** The assessment workspace: a project conversation at full viewport. */
export default function Workspace() {
  return <ChatAppExample className="h-full rounded-none border-0" />;
}
