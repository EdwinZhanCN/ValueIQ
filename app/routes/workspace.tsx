import { StructuredIntake } from "../components/intake/structured-intake";
import type { Route } from "./+types/workspace";
import { ChatAppExample } from "../components/agents/chat-app-example";
import { useSearchParams } from "react-router";
import { OutputWorkspace } from "../components/output/output-workspace";

export const meta: Route.MetaFunction = () => [
  { title: "Workspace · ValueIQ" },
  {
    name: "description",
    content:
      "Inspect sample engine results, evidence gaps, calculation steps and charts. This is a labeled stub preview, not a live assessment.",
  },
];

/**
 * Sample-backed output preview, without a loader, action or backend calls.
 * ?view=chat retains the original vendored agent UI example.
 */
export default function Workspace() {
  const [params] = useSearchParams();
  if (params.get("view") === "intake") return <StructuredIntake />;
  return params.get("view") === "chat" ? (
    <ChatAppExample className="h-full rounded-none border-0" />
  ) : (
    <OutputWorkspace />
  );
}
