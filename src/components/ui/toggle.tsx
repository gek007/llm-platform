import { Toggle as TogglePart } from "@ui-sdk/react/toggle";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

function Toggle({ className, ...props }: ComponentProps<typeof TogglePart>) {
  return (
    <TogglePart
      className={mergeClassName(
        "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/60 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-pressed:border-accent data-pressed:bg-accent data-pressed:text-accent-fg data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Toggle };
