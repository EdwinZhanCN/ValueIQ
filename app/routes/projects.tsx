import { Link } from "react-router";
import { requireTeam } from "../server/team.server";
import { listTeamProjects } from "../server/projects.server";
import type { Route } from "./+types/projects";
export async function loader({ request }: Route.LoaderArgs) {
  const { team } = await requireTeam(request);
  return { projects: await listTeamProjects(team.id) };
}
export default function Projects({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          to="/projects/new"
        >
          New project
        </Link>
      </div>
      {loaderData.projects.length === 0 ? (
        <p className="text-muted-foreground">
          No projects yet. Create a project to save its intake.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {loaderData.projects.map((project) => (
            <li key={project.id}>
              <Link
                className="flex justify-between p-5 hover:bg-muted"
                to={`/projects/${project.id}`}
              >
                <strong>{project.name}</strong>
                <span className="text-sm text-muted-foreground">
                  Open intake →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
