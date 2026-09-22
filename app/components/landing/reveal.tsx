import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "~/lib/ease";

/**
 * Scroll-entrance wrapper. Motion is load-bearing here: sections arrive in
 * reading order so the page tells a sequence. Reduced motion collapses to a
 * plain fade.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-reveal
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reduce
          ? { duration: 0.3, delay }
          : { duration: 0.6, delay, ease: EASE_OUT }
      }
    >
      {children}
    </motion.div>
  );
}
