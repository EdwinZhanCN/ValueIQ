const MAX_PROJECT_SLUG_LENGTH = 96;

/** Build a stable, readable PDF filename from a project's display name. */
export function reportFilename(projectName: string): string {
  const slug = Array.from(
    projectName
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, ""),
  )
    .slice(0, MAX_PROJECT_SLUG_LENGTH)
    .join("")
    .replace(/-+$/g, "");

  return `valueiq-${slug || "project"}.pdf`;
}
