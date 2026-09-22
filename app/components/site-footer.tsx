import { Link } from "react-router";
import { BrandWordmark } from "./brand";
import { Container } from "./landing/primitives";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { to: "/#method", label: "Method" },
      { to: "/#conversation", label: "Conversation" },
      { to: "/#calculations", label: "Calculations" },
    ],
  },
  {
    heading: "Reference",
    links: [{ to: "/#faq", label: "FAQ" }],
  },
  {
    heading: "Project",
    links: [{ to: "/workspace", label: "Open workspace" }],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted text-foreground">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8">
        <div className="max-w-md">
          <BrandWordmark height={24} />
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Project value assessment with auditable math. Estimates are derived
            from stated inputs, never from silent assumptions.
          </p>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Early scaffold: conversations are saved; AI assessment and
            calculations are not connected yet.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-3"
        >
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-sm font-medium text-muted-foreground">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-foreground/75 transition-colors duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>ValueIQ</p>
          <p>Runs on Cloudflare Workers, D1 and a Durable Object.</p>
        </Container>
      </div>
    </footer>
  );
}
