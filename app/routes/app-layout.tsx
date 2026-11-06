import {
  Form,
  Link,
  NavLink,
  Outlet,
  useLocation,
  useSubmit,
} from "react-router";
import { LogOut } from "lucide-react";
import { BrandMark } from "~/components/brand";
import { ThemeToggle } from "~/components/motion/theme-toggle";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { requireUser } from "../server/team.server";
import { homeFor } from "~/lib/redirect";
import type { Route } from "./+types/app-layout";

/**
 * The signed-in application shell: a header with the current team and
 * sign-out, then the page. Every child is signed in; a child that needs a team
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
  { to: "/projects", label: "Projects" },
  { to: "/team", label: "Team" },
];

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { user, team, teams } = loaderData;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            to={homeFor(team)}
            aria-label="ValueIQ"
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark size={24} />
          </Link>
          {team ? <TeamSwitcher current={team.id} teams={teams} /> : null}
          {team ? (
            <nav aria-label="App" className="ml-2 flex items-center gap-0.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      isActive && "bg-muted text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <span
              className="hidden max-w-48 truncate px-2 text-sm text-muted-foreground sm:block"
              title={user.email}
            >
              {user.name}
            </span>
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
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
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
      <span className="max-w-48 truncate text-sm font-medium">{name}</span>
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
        className="h-8 max-w-48 truncate rounded-lg border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
