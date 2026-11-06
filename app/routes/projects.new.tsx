import { readSmallForm } from "../server/form-body.server";
import { data, Form, redirect } from "react-router";
import { requireTeam } from "../server/team.server";
import { createProject } from "../server/projects.server";
import { SubmitButton } from "../components/submit-button";
import type { Route } from "./+types/projects.new";
export async function loader({ request }: Route.LoaderArgs) {
  await requireTeam(request);
  return null;
}
export async function action({ request }: Route.ActionArgs) {
  const { team, user } = await requireTeam(request);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  const form = await readSmallForm(request);
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 200)
    return data(
      { error: "Enter a project name (up to 200 characters)." },
      { status: 400 },
    );
  const id = await createProject({
    teamId: team.id,
    userId: user.id,
    name,
    goals: [],
  });
  return redirect(`/projects/${id}`);
}
export default function NewProject({ actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">New project</h1>
      <Form method="post" className="flex flex-col gap-4">
        <label htmlFor="name">Project name</label>
        <input
          id="name"
          name="name"
          maxLength={200}
          required
          className="rounded-lg border bg-card p-3"
        />
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        <SubmitButton>Create project</SubmitButton>
      </Form>
    </div>
  );
}
