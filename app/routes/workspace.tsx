import type { Route } from "./+types/workspace";
import { StructuredIntake } from "../components/intake/structured-intake";

export const meta: Route.MetaFunction = () => [
  { title: "Workspace · ValueIQ" },
  {
    name: "description",
    content:
      "Assess what a project is worth: describe the change, supply the facts, and read the estimate with its inputs and formulas.",
  },
];

/**
 * Local structured intake editor. It uses the shared form serializer and
 * validator, with JSON download. Storage, assistant and engine are not wired.
 */
export default function Workspace() {
  return <StructuredIntake />;
}
