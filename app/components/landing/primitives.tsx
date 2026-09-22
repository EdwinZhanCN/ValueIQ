import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/** The reference layout's shell: a 1440px container with 24px gutters. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-348 px-6", className)}>
      {children}
    </div>
  );
}

/** Small accent label that introduces a section heading. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("text-sm leading-5 font-medium text-primary", className)}>
      {children}
    </p>
  );
}

/**
 * Marketing button geometry: 36px tall, 10px radius, 300ms state changes with
 * a fast-in easing curve. Colors follow the shared shadcn button tokens.
 */
export const marketingButton = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-transparent px-3.5 text-sm font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      tone: "primary",
    },
  },
);
