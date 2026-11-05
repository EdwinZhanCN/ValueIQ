import type { Route } from "./+types/workspace";
import { IntakeForm } from "../components/intake/intake-form";

export const meta: Route.MetaFunction = () => [
  { title: "Project intake · ValueIQ" },
  {
    name: "description",
    content:
      "Describe your project, choose goals, and select supporting files.",
  },
];

// Local UI only. Form persistence (#53 / #58) and upload (#55) are not connected.
export default function Workspace() {
  return <IntakeForm />;
}
