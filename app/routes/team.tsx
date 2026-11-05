import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { data, Form, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { createDb } from "../../db/client";
import { member, user } from "../../db/schema";
import { createAuth } from "../server/auth.server";
import { authErrorMessage, requireTeam } from "../server/team.server";
import { formText } from "~/lib/form";
import type { Route } from "./+types/team";

export const meta: Route.MetaFunction = () => [{ title: "Team · ValueIQ" }];

export async function loader({ request }: Route.LoaderArgs) {
  const { team } = await requireTeam(request);
  const members = await createDb(env.DB)
    .select({
      id: member.id,
      name: user.name,
      email: user.email,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, team.id))
    .orderBy(asc(member.createdAt))
    .all();
  return { team, members };
}

/**
 * "Add people": only the team's owner, and only existing accounts. Better
 * Auth has no HTTP endpoint for adding a member directly, so this action
 * checks the owner itself, then calls `auth.api.addMember`. No email is sent.
 */
export async function action({ request }: Route.ActionArgs) {
  const { team } = await requireTeam(request);
  if (team.role !== "owner") {
    return data(
      { error: "Only the team owner can add people." },
      { status: 403 },
    );
  }
  const form = await request.formData();
  const email = formText(form, "email").trim().toLowerCase();
  if (!email) return data({ error: "Enter an email." }, { status: 400 });

  const account = await createDb(env.DB)
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .get();
  if (!account) {
    return data({ error: "No account uses that email." }, { status: 400 });
  }
  try {
    await createAuth(env).api.addMember({
      body: { userId: account.id, organizationId: team.id, role: "member" },
      // Only so Better Auth can resolve its base URL from the request host.
      headers: request.headers,
    });
  } catch (error) {
    return data({ error: authErrorMessage(error) }, { status: 400 });
  }
  return { added: email };
}

export default function TeamPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { team, members } = loaderData;
  const isOwner = team.role === "owner";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">{team.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Members{" "}
            <span className="text-muted-foreground">{members.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y divide-border" aria-label="Members">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase">
                  {m.name.slice(0, 1)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{m.name}</span>
                  <span className="truncate text-muted-foreground">
                    {m.email}
                  </span>
                </span>
                {m.role === "owner" ? (
                  <Badge variant="secondary" className="ml-auto">
                    Owner
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
          {isOwner ? <AddPeople actionData={actionData} /> : null}
        </CardContent>
      </Card>

      {/* Z4: the owner-only team settings form goes here. */}
    </div>
  );
}

function AddPeople({
  actionData,
}: {
  actionData: Route.ComponentProps["actionData"];
}) {
  const form = useRef<HTMLFormElement>(null);
  const idle = useNavigation().state === "idle";
  const added = actionData && "added" in actionData ? actionData.added : null;
  useEffect(() => {
    if (added && idle) form.current?.reset();
  }, [added, idle]);
  return (
    <Form ref={form} method="post" className="flex flex-col gap-2">
      <Field orientation="horizontal" className="gap-2">
        <Input
          name="email"
          type="email"
          aria-label="Email of an existing account"
          placeholder="name@example.com"
          required
        />
        <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      </Field>
      <FieldError>
        {actionData && "error" in actionData ? actionData.error : null}
      </FieldError>
    </Form>
  );
}
