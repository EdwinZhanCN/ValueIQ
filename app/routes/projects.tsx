import { FolderOpen, Loader2, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import {
  parseStatusFilter,
  STATUS_FILTERS,
  STATUS_LABELS,
  type ProjectStatus,
  type StatusFilter,
} from "../lib/project-progress";
import { cn } from "../lib/utils";
import { requireTeam } from "../server/team.server";
import { listTeamProgress } from "../server/project-progress.server";
import type { Route } from "./+types/projects";

export const meta: Route.MetaFunction = () => [{ title: "Projects · ValueIQ" }];

export async function loader({ request }: Route.LoaderArgs) {
  const { team } = await requireTeam(request);
  const projects = await listTeamProgress(team.id);
  return {
    projects: projects.map((project) => ({
      ...project,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}

const TAB_LABEL: Record<StatusFilter, string> = {
  all: "All",
  ...STATUS_LABELS,
};

const STATUS_BADGE: Record<ProjectStatus, "secondary" | "outline" | "default"> =
  {
    in_progress: "outline",
    needs_review: "secondary",
    complete: "default",
  };

/** Mock UI 02: status tabs (`?status=`), status badge and step progress per project. */
export default function Projects({ loaderData }: Route.ComponentProps) {
  const { projects } = loaderData;
  const [search] = useSearchParams();
  const filter = parseStatusFilter(search.get("status"));
  return <ProjectList projects={projects} filter={filter} />;
}

function ProjectList({
  projects,
  filter,
}: {
  projects: Route.ComponentProps["loaderData"]["projects"];
  filter: StatusFilter;
}) {
  const counts = Object.fromEntries(
    STATUS_FILTERS.map((status) => [
      status,
      status === "all"
        ? projects.length
        : projects.filter((project) => project.status === status).length,
    ]),
  ) as Record<StatusFilter, number>;
  const shown =
    filter === "all"
      ? projects
      : projects.filter((project) => project.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl font-medium">Projects</h1>
        <Link
          to="/projects/new"
          className={buttonVariants({ size: "sm", className: "ml-auto" })}
        >
          <Plus />
          New project
        </Link>
      </div>

      <nav
        aria-label="Project status"
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px] text-sm"
      >
        {STATUS_FILTERS.map((status) => {
          const active = status === filter;
          return (
            <Link
              key={status}
              to={status === "all" ? "/projects" : `/projects?status=${status}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "bg-background text-foreground shadow-sm",
              )}
            >
              {TAB_LABEL[status]}
              <span className="tabular-nums text-xs text-muted-foreground">
                {counts[status]}
              </span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>No projects</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-xl border">
          {shown.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="flex flex-wrap gap-1">
                    {project.goals.map((goal) => (
                      <Badge key={goal} variant="outline">
                        {goal}
                      </Badge>
                    ))}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-3">
                  {project.processing ? (
                    <Badge variant="secondary" data-testid="processing">
                      <Loader2 className="animate-spin" />
                      Processing
                    </Badge>
                  ) : null}
                  <Badge
                    variant={STATUS_BADGE[project.status]}
                    data-status={project.status}
                  >
                    {STATUS_LABELS[project.status]}
                  </Badge>
                  <span
                    className="w-28 text-right text-sm text-muted-foreground"
                    data-step={project.step.position}
                  >
                    {project.step.label}{" "}
                    <span className="tabular-nums">
                      · {project.step.position} / 5
                    </span>
                  </span>
                  <time
                    dateTime={project.updatedAt}
                    className="w-20 text-right text-xs text-muted-foreground"
                  >
                    {project.updatedAt.slice(0, 10)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
