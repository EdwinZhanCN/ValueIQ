import { Outlet } from "react-router";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

/**
 * Marketing shell. Everything on the public site renders inside the site
 * header and footer; the workspace routes deliberately sit outside it.
 */
export default function SiteLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
