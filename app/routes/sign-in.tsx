import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useSearchParams } from "react-router";
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
  getSignedIn,
  listTeams,
} from "../server/team.server";
import { formText } from "~/lib/form";
import { homeFor, safeRedirect } from "~/lib/redirect";
import type { Route } from "./+types/sign-in";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · ValueIQ" }];

export async function loader({ request }: Route.LoaderArgs) {
  const signedIn = await getSignedIn(request);
  if (signedIn) {
    const back = new URL(request.url).searchParams.get("redirectTo");
    throw redirect(safeRedirect(back) ?? homeFor(signedIn.team));
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = formText(form, "email").trim();
  const password = formText(form, "password");
  try {
    const { headers, response } = await createAuth(env).api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    });
    const teams = await listTeams(response.user.id);
    const to =
      safeRedirect(form.get("redirectTo")) ?? homeFor(teams[0] ?? null);
    return redirect(to, { headers: cookiesFrom(headers) });
  } catch (error) {
    return data({ error: authErrorMessage(error) }, { status: 400 });
  }
}

export default function SignIn({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirectTo"));
  const signUp = redirectTo
    ? `/sign-up?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/sign-up";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post">
          {redirectTo ? (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <FieldError>{actionData?.error}</FieldError>
            <SubmitButton size="lg" pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
            <Link
              to={signUp}
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Create an account
            </Link>
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
  );
}
