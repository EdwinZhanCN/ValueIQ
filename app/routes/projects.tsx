import { FolderOpen, Plus } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { requireTeam } from "../server/team.server";
import { listTeamProjects } from "../server/projects.server";
import type { Route } from "./+types/projects";

export const meta: Route.MetaFunction = () => [{ title: "Projects · ValueIQ" }];

export async function loader({ request }: Route.LoaderArgs) {
  const { team } = await requireTeam(request);
  const projects = await listTeamProjects(team.id);
  return {
    projects: projects.map((project) => ({
      ...project,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  const { projects } = loaderData;

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

      {projects.length === 0 ? (
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
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="font-medium">{project.name}</span>
                <span className="flex flex-wrap gap-1">
                  {project.goals.map((goal) => (
                    <Badge key={goal} variant="outline">
                      {goal}
                    </Badge>
                  ))}
                </span>
                <time
                  dateTime={project.updatedAt}
                  className="ml-auto shrink-0 text-xs text-muted-foreground"
                >
                  {project.updatedAt.slice(0, 10)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
