import type { ComponentProps } from "react";
import { useNavigation } from "react-router";
import { ActionSwapText } from "./motion/action-swap";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

/**
 * Submit button that reflects React Router navigation state. The label swaps
 * through beUI's blur action so the state change reads as a transition rather
 * than a layout jump.
 */
export function SubmitButton({
  children,
  className,
  ...props
}: {
  children: string;
  className?: string;
} & Omit<ComponentProps<typeof Button>, "children" | "type">) {
  const busy = useNavigation().state !== "idle";
  return (
    <Button type="submit" disabled={busy} className={className} {...props}>
      {busy ? <Spinner className="size-4" /> : null}
      <ActionSwapText value={busy ? "busy" : "idle"}>
        {busy ? "Saving…" : children}
      </ActionSwapText>
    </Button>
  );
}
