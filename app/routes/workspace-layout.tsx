import { Outlet } from "react-router";

/**
 * Application shell. The workspace owns the entire viewport — no site header,
 * no site footer, no page scrolling — and each pane scrolls on its own.
 *
 * The intake editor provides its own main landmark and scroll container.
 */
export default function WorkspaceLayout() {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
