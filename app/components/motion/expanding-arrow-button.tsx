import { type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { cn } from "~/lib/utils";

export interface ExpandingArrowButtonProps {
  children: ReactNode;
  to?: string;
  href?: string;
  className?: string;
  tone?: "primary" | "outline" | "secondary";
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const TONES = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/80 border border-transparent",
  outline:
    "border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/40",
};

export function ExpandingArrowButton({
  children,
  to,
  href,
  className,
  tone = "primary",
  onClick,
  type = "button",
  disabled,
}: ExpandingArrowButtonProps) {
  const baseClasses = cn(
    "group relative inline-flex h-11 items-center justify-center gap-2.5 rounded-full px-5 text-sm font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    TONES[tone],
    disabled && "pointer-events-none opacity-50",
    className,
  );

  const innerContent = (
    <>
      <span className="truncate">{children}</span>
      <motion.span className="inline-flex shrink-0 items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1">
        <ArrowRight className="size-4" />
      </motion.span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={baseClasses}>
        {innerContent}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        {innerContent}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
    >
      {innerContent}
    </button>
  );
}
