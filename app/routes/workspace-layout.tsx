import { Outlet } from "react-router";

/**
 * Application shell. The workspace owns the entire viewport — no site header,
 * no site footer, no page scrolling — and each pane scrolls on its own.
 *
 * Routes under this layout render `AnimatedSidebarInset`, which is already a
 * `<main>`, so this layout adds no landmark of its own.
 */
export default function WorkspaceLayout() {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
