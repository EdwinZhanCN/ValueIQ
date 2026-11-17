import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { data, Form, useFetcher, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "~/components/submit-button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { createDb } from "../../db/client";
import { member, user } from "../../db/schema";
import { createAuth } from "../server/auth.server";
import { authErrorMessage, requireTeam } from "../server/team.server";
import {
  getTeamSettings,
  setTeamSetting,
} from "../server/team-settings.server";
import {
  TEAM_SETTING_KEYS,
  TEAM_SETTING_LABELS,
  UPLIFT_TIERS,
  formatSetting,
  isTeamSettingKey,
  type CostUplift,
  type TeamSettingKey,
} from "../../shared/team-settings";
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
  const current = await getTeamSettings(team.id);
  const day = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const settings = TEAM_SETTING_KEYS.map((key) => {
    const s = current[key];
    return {
      key,
      label: TEAM_SETTING_LABELS[key],
      value: s.value,
      shown: formatSetting(key, s.value),
      rationale: s.rationale,
      source: s.source,
      starting: s.starting,
      changed:
        s.starting || !s.effectiveFrom
          ? null
          : `${s.setByName ?? "Someone"} · ${day.format(new Date(s.effectiveFrom))}`,
    };
  });
  return { team, members, settings };
}

/**
 * "Add people": only the team's owner, and only existing accounts. Better
 * Auth has no HTTP endpoint for adding a member directly, so this action
 * checks the owner itself, then calls `auth.api.addMember`. No email is sent.
 */
export async function action({ request }: Route.ActionArgs) {
  const { team, user: me } = await requireTeam(request);
  if (team.role !== "owner") {
    return data(
      { error: "Only the team owner can change the team." },
      { status: 403 },
    );
  }
  const form = await request.formData();
  if (formText(form, "intent") === "set-setting") {
    const key = formText(form, "key");
    if (!isTeamSettingKey(key))
      return data({ settingError: "Unknown setting." }, { status: 400 });
    const raw =
      key === "cost_uplift_pct"
        ? Object.fromEntries(
            UPLIFT_TIERS.map((tier) => [tier, formText(form, tier)]),
          )
        : formText(form, "value");
    const result = await setTeamSetting(
      team.id,
      me.id,
      key,
      raw,
      formText(form, "rationale"),
      formText(form, "source"),
    );
    if (!result.ok)
      return data(
        { settingKey: key, settingError: result.error },
        { status: 400 },
      );
    return { settingKey: key, settingSaved: true as const };
  }
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
  const { team, members, settings } = loaderData;
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

      <FinancialDefaults settings={settings} isOwner={isOwner} />
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

type SettingRow = Route.ComponentProps["loaderData"]["settings"][number];

/**
 * Financial defaults (#88): every member sees the values in effect, why, and
 * who set them; the owner can change one at a time. Each change is a new row,
 * effective from now; runs keep the version they used.
 */
function FinancialDefaults({
  settings,
  isOwner,
}: {
  settings: SettingRow[];
  isOwner: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial defaults</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border" aria-label="Financial defaults">
          {settings.map((row) => (
            <SettingItem key={row.key} row={row} isOwner={isOwner} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SettingItem({ row, isOwner }: { row: SettingRow; isOwner: boolean }) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<typeof action>();
  const reply = fetcher.data as
    | { settingKey?: string; settingError?: string; settingSaved?: true }
    | undefined;
  const error = reply?.settingError ?? null;
  const saved = reply?.settingSaved === true;
  useEffect(() => {
    if (saved && fetcher.state === "idle") setEditing(false);
  }, [saved, fetcher.state]);
  return (
    <li className="flex flex-col gap-2 py-3" data-setting={row.key}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-sm">{row.label}</span>
        <strong className="text-lg font-semibold" data-testid="setting-value">
          {row.shown}
        </strong>
        {row.starting ? (
          <Badge variant="secondary">Starting default</Badge>
        ) : (
          <Badge variant="outline" data-testid="setting-changed">
            {row.changed}
          </Badge>
        )}
        {isOwner && !editing ? (
          <button
            type="button"
            className="text-sm text-primary underline underline-offset-2"
            onClick={() => setEditing(true)}
            aria-label={`Change ${row.label}`}
          >
            Change
          </button>
        ) : null}
      </div>
      {row.rationale ? (
        <p className="text-sm" data-testid="setting-rationale">
          {row.rationale}
        </p>
      ) : null}
      {row.source ? (
        <p className="text-xs text-muted-foreground">{row.source}</p>
      ) : null}
      {isOwner && editing ? (
        <fetcher.Form
          // A saved value revalidates the page; a fresh form keeps the inputs uncontrolled.
          key={row.shown}
          method="post"
          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
          aria-label={`Change ${row.label}`}
        >
          <input type="hidden" name="intent" value="set-setting" />
          <input type="hidden" name="key" value={row.key} />
          <div className="flex flex-wrap gap-2">
            {row.key === "cost_uplift_pct" ? (
              UPLIFT_TIERS.map((tier) => (
                <label key={tier} className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground capitalize">
                    {tier} %
                  </span>
                  <Input
                    name={tier}
                    inputMode="decimal"
                    className="w-24"
                    defaultValue={String((row.value as CostUplift)[tier])}
                  />
                </label>
              ))
            ) : (
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  {unitLabel(row.key)}
                </span>
                <Input
                  name="value"
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={
                    typeof row.value === "number" ? String(row.value) : ""
                  }
                />
              </label>
            )}
          </div>
          <Input
            name="rationale"
            aria-label="Why it changes"
            placeholder="Why it changes"
            maxLength={300}
          />
          <Input
            name="source"
            aria-label="Source (optional)"
            placeholder="Source (optional)"
            maxLength={200}
          />
          <FieldError>{error}</FieldError>
          <div className="flex gap-2">
            <SubmitButton
              size="sm"
              pendingLabel="Saving…"
              disabled={fetcher.state !== "idle"}
            >
              Save
            </SubmitButton>
            <button
              type="button"
              className="text-sm text-muted-foreground"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </fetcher.Form>
      ) : null}
    </li>
  );
}

function unitLabel(key: TeamSettingKey) {
  return key === "horizon_years" ? "Years" : "Percent";
}
