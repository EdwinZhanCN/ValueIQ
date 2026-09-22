import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { CommandPalette } from "./blocks/command-palette";
import { BrandWordmark } from "./brand";
import { Container, marketingButton } from "./landing/primitives";
import { ThemeToggle } from "./motion/theme-toggle";

const LANDING_LINKS = [
  { to: "/#method", label: "Method" },
  { to: "/#conversation", label: "Conversation" },
  { to: "/#calculations", label: "Calculations" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
      {onLanding ? (
        <div className="bg-muted text-foreground">
          <Container className="flex min-h-11 items-center justify-center py-2">
            <p className="text-center text-[13px] leading-snug text-muted-foreground">
              Conversations are saved. Assessment and calculations are not
              connected yet.
            </p>
          </Container>
        </div>
      ) : null}
      <Container className="flex h-16.75 items-center gap-3">
        <Link
          to="/"
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandWordmark height={24} />
        </Link>
        <nav
          aria-label="Main"
          className="ml-4 hidden items-center gap-0.5 lg:flex"
        >
          {LANDING_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-[10px] px-3 py-2 text-[15px] text-foreground/80 transition-colors duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <ThemeToggle
            className="size-9 rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            iconClassName="size-4"
          />
          <Link
            to="/workspace"
            className={cn(
              marketingButton({ tone: "primary" }),
              "hidden sm:inline-flex",
            )}
          >
            Open workspace
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-header-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </Container>
      {menuOpen ? (
        <div
          id="site-header-mobile-menu"
          className="border-t border-border/70 bg-background lg:hidden"
        >
          <Container className="flex flex-col py-3">
            {LANDING_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg px-2 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/workspace"
              className={cn(
                marketingButton({ tone: "primary" }),
                "mt-2 sm:hidden",
              )}
            >
              Open workspace
            </Link>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
