import {
  Form,
  Link,
  NavLink,
  Outlet,
  useLocation,
  useSubmit,
} from "react-router";
import { Folder, LogOut, Users } from "lucide-react";
import { BrandMark } from "~/components/brand";
import { ThemeToggle } from "~/components/motion/theme-toggle";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { requireUser } from "../server/team.server";
import { homeFor } from "~/lib/redirect";
import type { Route } from "./+types/app-layout";

/**
 * The signed-in application shell (mock UI): a left sidebar with the team,
 * navigation and account, then the page; a top bar on narrow screens. Every child is signed in; a child that needs a team
 * calls `requireTeam` in its own loader (layout and child loaders run in
 * parallel, so the layout cannot guard for them).
 *
 * Children read the shell's data with
 * `useRouteLoaderData<typeof loader>("routes/app-layout")`.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { user, team, teams } = await requireUser(request);
  return { user, team, teams };
}

const NAV = [
  { to: "/projects", label: "Projects", icon: Folder },
  { to: "/team", label: "Team", icon: Users },
];

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { user, team, teams } = loaderData;
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-border/70 bg-muted/40 px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:gap-6 md:border-r md:border-b-0 md:px-3.5 md:py-5">
        <div className="flex items-center gap-3 md:flex-col md:items-stretch md:gap-6">
          <Link
            to={homeFor(team)}
            className="flex items-center gap-2.5 rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark size={28} />
            <span className="hidden sm:inline">ValueIQ</span>
          </Link>
          {team ? <TeamSwitcher current={team.id} teams={teams} /> : null}
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <AccountActions />
          </div>
        </div>
        {team ? (
          <nav aria-label="App">
            <ul className="flex gap-0.5 md:flex-col">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        isActive && "bg-primary/10 font-medium text-primary",
                      )
                    }
                  >
                    <item.icon className="size-4.5" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className="mt-auto hidden items-center gap-2.5 px-2 md:flex">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium"
            title={user.email}
          >
            {user.name}
          </span>
          <AccountActions />
        </div>
      </aside>
      <main className="w-full min-w-0 flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function AccountActions() {
  return (
    <>
      <ThemeToggle
        className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        iconClassName="size-4"
      />
      <Form method="post" action="/sign-out">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut />
        </Button>
      </Form>
    </>
  );
}

/** The team name; a picker when the person belongs to more than one team. */
function TeamSwitcher({
  current,
  teams,
}: {
  current: string;
  teams: { id: string; name: string }[];
}) {
  const submit = useSubmit();
  const { pathname, search } = useLocation();
  const name = teams.find((t) => t.id === current)?.name;
  if (teams.length < 2) {
    return (
      <span className="flex min-h-10 max-w-48 items-center truncate rounded-lg border bg-background px-3 text-sm font-medium md:max-w-none">
        {name}
      </span>
    );
  }
  return (
    <Form method="post" action="/teams/active">
      <input type="hidden" name="redirectTo" value={pathname + search} />
      <select
        name="teamId"
        aria-label="Team"
        defaultValue={current}
        onChange={(event) => void submit(event.currentTarget.form)}
        className="h-10 w-full max-w-48 truncate rounded-lg border bg-background px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:max-w-none"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </Form>
  );
}
