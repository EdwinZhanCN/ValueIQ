import { Check } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../../lib/utils";

export type StepKey = "intake" | "clarify" | "process" | "review" | "report";
export type StepState = "done" | "todo";

export const STEPS: { key: StepKey; label: string; path: string }[] = [
  { key: "intake", label: "Intake", path: "" },
  { key: "clarify", label: "Clarify", path: "/clarify" },
  { key: "process", label: "Process", path: "/process" },
  { key: "review", label: "Review", path: "/results" },
  { key: "report", label: "Report", path: "/report" },
];

const INTAKE = STEPS[0]!;

export const stepPath = (projectId: string, key: StepKey) =>
  `/projects/${projectId}${STEPS.find((step) => step.key === key)!.path}`;

/** The step a project-flow URL belongs to (Intake for the project root). */
export function stepFor(pathname: string, projectId: string) {
  const rest = pathname
    .replace(`/projects/${projectId}`, "")
    .replace(/\/$/, "");
  return (
    STEPS.find((step) => step.path && rest.startsWith(step.path)) ?? INTAKE
  );
}

/** Mock UI progress bar: done steps get a check, the current one is filled. */
export function ProjectSteps({
  projectId,
  current,
  done,
}: {
  projectId: string;
  current: StepKey;
  done: Record<string, StepState>;
}) {
  return (
    <ol
      aria-label="Assessment progress"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.key === current;
        const isDone = done[step.key] === "done" && !isCurrent;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <Link
              to={stepPath(projectId, step.key)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                !isCurrent && !isDone && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent && "bg-primary text-primary-foreground",
                  isDone && "bg-primary/10 text-primary",
                  !isCurrent && !isDone && "border border-border",
                )}
              >
                {isDone ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>
              <span className={cn(isCurrent && "font-semibold")}>
                {step.label}
              </span>
            </Link>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 w-7 rounded-full",
                  isDone ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
