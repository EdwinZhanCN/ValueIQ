import { data, Form, redirect } from "react-router";
import { SubmitButton } from "../components/submit-button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { formText } from "~/lib/form";
import { requireTeam } from "../server/team.server";
import { createProject } from "../server/projects.server";
import type { Route } from "./+types/projects.new";

export const meta: Route.MetaFunction = () => [
  { title: "New project · ValueIQ" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireTeam(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { user, team } = await requireTeam(request);
  const form = await request.formData();
  const name = formText(form, "name").trim();
  const goals = [
    ...new Set(
      formText(form, "goals")
        .split("\n")
        .map((goal) => goal.trim())
        .filter(Boolean),
    ),
  ];
  if (!name || name.length > 200) {
    return data({ error: "Name is required (up to 200 characters)." }, 400);
  }
  const id = await createProject({
    teamId: team.id,
    userId: user.id,
    name,
    goals,
  });
  return redirect(`/projects/${id}`);
}

export default function NewProject({ actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">New project</h1>
      <Form method="post">
        <FieldGroup>
          <Field data-invalid={actionData?.error ? true : undefined}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              autoFocus
              aria-invalid={actionData?.error ? true : undefined}
            />
            <FieldError>{actionData?.error}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="goals">Goals, one per line</FieldLabel>
            <Textarea id="goals" name="goals" rows={4} />
          </Field>
          <SubmitButton className="self-start" pendingLabel="Creating…">
            Create
          </SubmitButton>
        </FieldGroup>
      </Form>
    </div>
  );
}
