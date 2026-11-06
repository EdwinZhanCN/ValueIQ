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
} from "../server/team.server";
import { formText } from "~/lib/form";
import { homeFor, safeRedirect } from "~/lib/redirect";
import type { Route } from "./+types/sign-up";

export const meta: Route.MetaFunction = () => [
  { title: "Create an account · ValueIQ" },
];

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
  const name = formText(form, "name").trim();
  const email = formText(form, "email").trim();
  const password = formText(form, "password");
  if (!name) return data({ error: "Enter your name." }, { status: 400 });
  try {
    const { headers } = await createAuth(env).api.signUpEmail({
      body: { name, email, password },
      headers: request.headers,
      returnHeaders: true,
    });
    // A new account has no team yet.
    const to = safeRedirect(form.get("redirectTo")) ?? homeFor(null);
    return redirect(to, { headers: cookiesFrom(headers) });
  } catch (error) {
    return data({ error: authErrorMessage(error) }, { status: 400 });
  }
}

export default function SignUp({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const redirectTo = safeRedirect(params.get("redirectTo"));
  const signIn = redirectTo
    ? `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/sign-in";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create an account</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post">
          {redirectTo ? (
            <input type="hidden" name="redirectTo" value={redirectTo} />
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
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
                autoComplete="new-password"
                minLength={8}
                placeholder="8+ characters"
                required
              />
            </Field>
            <FieldError>{actionData?.error}</FieldError>
            <SubmitButton size="lg" pendingLabel="Creating…">
              Create account
            </SubmitButton>
            <Link
              to={signIn}
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Sign in instead
            </Link>
          </FieldGroup>
        </Form>
      </CardContent>
    </Card>
  );
}
