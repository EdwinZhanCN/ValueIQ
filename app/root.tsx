import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { ThemeProvider } from "next-themes";
import { Compass } from "lucide-react";
import type { Route } from "./+types/root";
import { TooltipProvider } from "./components/ui/tooltip";
import { cn } from "./lib/utils";
import "./styles.css";

export const meta: Route.MetaFunction = () => [
  { title: "ValueIQ" },
  {
    name: "description",
    content:
      "Project value assessment with auditable math: collect the missing facts, then estimate capacity, quality and risk.",
  },
];

/**
 * Document shell only. Page chrome belongs to the surface layouts:
 * `routes/site-layout.tsx` wraps the landing page in the site header and
 * footer, and `routes/workspace-layout.tsx` gives the workspace the whole
 * viewport. Error pages render without a surface layout, so they bring their
 * own frame.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Browser and iOS icon requests are answered from `public/`, so they
            never reach the router as unmatched routes. */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links />
        {/* Entrance animations start hidden; without JavaScript, show them. */}
        <noscript>
          <style>{`[data-reveal], [data-reveal] * { opacity: 1 !important; transform: none !important; filter: none !important; }`}</style>
        </noscript>
      </head>
      <body>
        {/* System preference by default; the toggle stores an explicit choice. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="valueiq-theme"
        >
          <TooltipProvider>
            {children}
            <div className="grain" aria-hidden="true" />
          </TooltipProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <section className="flex max-w-xl flex-col items-center text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/10">
          <Compass className="size-6 animate-pulse" />
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs font-mono text-muted-foreground">
          <span>STATUS</span>
          <span className="font-semibold text-foreground">
            {missing ? "404" : "ERROR"}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
          {missing ? "Page Not Found" : "Unexpected Error"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground max-w-md">
          {missing
            ? "This page does not exist or has been relocated."
            : "The application encountered an unexpected condition. Please try refreshing or return to one of the two surfaces."}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <span>Landing page</span>
          </Link>
          <Link
            to="/workspace"
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all",
            )}
          >
            <span>Open workspace</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
