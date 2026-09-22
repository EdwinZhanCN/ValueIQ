import { useRef, type ReactNode, type MouseEvent } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { cn } from "~/lib/utils";

export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  spotlight?: boolean;
}

export function TiltCard({
  children,
  className,
  maxTilt = 7,
  spotlight = true,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { damping: 22, stiffness: 260 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(springY, [0, 1], [maxTilt, -maxTilt]);
  const rotateY = useTransform(springX, [0, 1], [-maxTilt, maxTilt]);

  const spotlightX = useTransform(springX, [0, 1], ["0%", "100%"]);
  const spotlightY = useTransform(springY, [0, 1], ["0%", "100%"]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        reduce
          ? undefined
          : {
              rotateX,
              rotateY,
              transformStyle: "preserve-3d",
            }
      }
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground p-7 lg:p-9 transition-[border-color,box-shadow] duration-300 will-change-transform hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5",
        className,
      )}
    >
      {/* Dynamic Cursor-following Spotlight Overlay */}
      {spotlight && !reduce ? (
        <motion.div
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: useTransform(
              [spotlightX, spotlightY],
              ([x, y]) =>
                `radial-gradient(400px circle at ${String(x)} ${String(y)}, color-mix(in oklch, var(--color-primary) 15%, transparent), transparent 70%)`,
            ),
          }}
        />
      ) : null}

      <div className="relative z-10 size-full">{children}</div>
    </motion.div>
  );
}
