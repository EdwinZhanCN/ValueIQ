/**
 * The labelled demo controls (L3 #80: "including a forced failure to show in
 * the demo"). They exist only where `DEMO_CONTROLS=on` — locally in
 * `.dev.vars`; deployed environments never set it.
 */

/** The text a simulated failure carries everywhere it shows. */
export const SIMULATED_FAILURE_MESSAGE = "Simulated failure (demo control)";

export function demoControlsOn(
  vars: Record<string, unknown> | undefined,
): boolean {
  return vars?.DEMO_CONTROLS === "on";
}

export type StartOptions = { simulateFailure: boolean };

/** `startRun`'s optional argument is untrusted: only `{ simulateFailure: true }` counts. */
export function parseStartOptions(raw: unknown): StartOptions {
  return {
    simulateFailure:
      typeof raw === "object" &&
      raw !== null &&
      (raw as { simulateFailure?: unknown }).simulateFailure === true,
  };
}

/** Why a start request is refused before anything else is read, or null. */
export function demoRefusal(
  options: StartOptions,
  vars: Record<string, unknown> | undefined,
): string | null {
  return options.simulateFailure && !demoControlsOn(vars)
    ? "Demo controls are off in this environment."
    : null;
}
