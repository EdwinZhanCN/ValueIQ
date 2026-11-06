import { env } from "cloudflare:workers";
import { data, Form, redirect } from "react-router";
import { SubmitButton } from "~/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { createAuth } from "../server/auth.server";
import {
  authErrorMessage,
  cookiesFrom,
  requireUser,
} from "../server/team.server";
import { formText } from "~/lib/form";
import type { Route } from "./+types/teams.new";

export const meta: Route.MetaFunction = () => [{ title: "New team · ValueIQ" }];

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

/** The slug is Better Auth's unique handle; nothing shows it yet. */
function slugFor(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "team"}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const name = formText(form, "name").trim();
  if (!name) return data({ error: "Enter a team name." }, { status: 400 });
  try {
    // The creator becomes `owner`, and the new team becomes the session's
    // current team.
    const { headers } = await createAuth(env).api.createOrganization({
      body: { name, slug: slugFor(name) },
      headers: request.headers,
      returnHeaders: true,
    });
    return redirect("/team", { headers: cookiesFrom(headers) });
  } catch (error) {
    return data({ error: authErrorMessage(error) }, { status: 400 });
  }
}

export default function NewTeam({ actionData }: Route.ComponentProps) {
  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">New team</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Team name</FieldLabel>
              <Input
                id="name"
                name="name"
                autoComplete="organization"
                maxLength={80}
                required
              />
            </Field>
            <FieldError>{actionData?.error}</FieldError>
            <SubmitButton size="lg" pendingLabel="Creating…">
              Create team
            </SubmitButton>
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
  );
}
