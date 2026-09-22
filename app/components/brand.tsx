import targetDark from "~/assets/valueiq-target-dark.png";
import targetLight from "~/assets/valueiq-target-light.png";
import wordmarkDark from "~/assets/valueiq-wordmark-dark.png";
import wordmarkLight from "~/assets/valueiq-wordmark-light.png";
import { cn } from "~/lib/utils";

/**
 * The target glyph / mark of ValueIQ.
 * Supports tone="auto" (default: adapts to dark/light theme),
 * tone="dark" (forces light-on-dark for dark sections like footer),
 * tone="light" (forces dark-on-light).
 */
export function BrandMark({
  className,
  size = 28,
  tone = "auto",
}: {
  className?: string;
  size?: number;
  tone?: "auto" | "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {tone === "dark" ? (
        <img
          src={targetDark}
          alt="ValueIQ"
          width={size}
          height={size}
          className="size-full object-contain"
        />
      ) : tone === "light" ? (
        <img
          src={targetLight}
          alt="ValueIQ"
          width={size}
          height={size}
          className="size-full object-contain"
        />
      ) : (
        <>
          <img
            src={targetLight}
            alt="ValueIQ"
            width={size}
            height={size}
            className="size-full object-contain dark:hidden"
          />
          <img
            src={targetDark}
            alt="ValueIQ"
            width={size}
            height={size}
            className="hidden size-full object-contain dark:block"
          />
        </>
      )}
    </span>
  );
}

/**
 * The full typographic wordmark of ValueIQ.
 */
export function BrandWordmark({
  className,
  height = 24,
  tone = "auto",
}: {
  className?: string;
  height?: number;
  tone?: "auto" | "dark" | "light";
}) {
  const width = Math.round(height * 3);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center", className)}
      style={{ height }}
    >
      {tone === "dark" ? (
        <img
          src={wordmarkDark}
          alt="ValueIQ"
          height={height}
          width={width}
          className="h-full w-auto object-contain"
        />
      ) : tone === "light" ? (
        <img
          src={wordmarkLight}
          alt="ValueIQ"
          height={height}
          width={width}
          className="h-full w-auto object-contain"
        />
      ) : (
        <>
          <img
            src={wordmarkLight}
            alt="ValueIQ"
            height={height}
            width={width}
            className="h-full w-auto object-contain dark:hidden"
          />
          <img
            src={wordmarkDark}
            alt="ValueIQ"
            height={height}
            width={width}
            className="hidden h-full w-auto object-contain dark:block"
          />
        </>
      )}
    </span>
  );
}
