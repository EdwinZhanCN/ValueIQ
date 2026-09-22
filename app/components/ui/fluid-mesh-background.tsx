import { cn } from "~/lib/utils";

interface FluidMeshBackgroundProps {
  className?: string;
  intensity?: "subtle" | "medium" | "vibrant";
  variant?: "hero" | "banner" | "canvas";
}

/**
 * Ambient Fluid Mesh Gradient Background.
 * Renders multiple floating OKLCH blur orbs that slowly morph and drift in the background.
 */
export function FluidMeshBackground({
  className,
  intensity = "medium",
  variant = "hero",
}: FluidMeshBackgroundProps) {
  const opacityMap = {
    subtle: "opacity-25 dark:opacity-35",
    medium: "opacity-45 dark:opacity-55",
    vibrant: "opacity-65 dark:opacity-75",
  };

  return (
    <div
      className={cn(
        "ambient-mesh-glow pointer-events-none select-none",
        variant === "hero" ? "h-[540px] sm:h-[680px]" : "h-full",
        className,
      )}
      aria-hidden="true"
    >
      {/* Container with high blur for organic liquid light blending */}
      <div
        className={cn(
          "relative size-full filter blur-[70px] sm:blur-[110px] transition-opacity duration-1000",
          opacityMap[intensity],
        )}
      >
        {/* Blob 1: ValueIQ Primary Teal (center-bottom rising) */}
        <div
          className="animate-mesh-drift-1 absolute -top-[10%] left-[20%] h-[320px] w-[420px] rounded-full sm:h-[420px] sm:w-[560px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Blob 2: Primary tint (top-right depth) */}
        <div
          className="animate-mesh-drift-2 absolute -top-[5%] right-[10%] h-[340px] w-[380px] rounded-full sm:h-[460px] sm:w-[520px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Blob 3: Primary highlight (left-center) */}
        <div
          className="animate-mesh-drift-3 absolute top-[35%] left-[5%] h-[280px] w-[360px] rounded-full sm:h-[380px] sm:w-[480px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Blob 4: Primary accent (bottom-center anchor) */}
        <div
          className="animate-mesh-drift-1 absolute top-[40%] right-[25%] h-[300px] w-[400px] rounded-full sm:h-[400px] sm:w-[520px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Top subtle fade to keep navigation content crystal clear */}
      <div
        className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background via-background/60 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom fade to seamlessly blend with the section below */}
      <div
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
