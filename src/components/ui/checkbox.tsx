import {
  Checkbox as CheckboxPart,
  CheckboxGroup as CheckboxGroupPart,
  CheckboxIndicator as CheckboxIndicatorPart,
} from "@ui-sdk/react/checkbox";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

function CheckboxGroup({ className, ...props }: ComponentProps<typeof CheckboxGroupPart>) {
  return <CheckboxGroupPart className={mergeClassName("flex flex-col gap-2", className)} {...props} />;
}

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPart>) {
  return (
    <CheckboxPart
      className={mergeClassName(
        "grid size-5 shrink-0 place-items-center rounded border border-line-strong bg-surface-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function CheckboxIndicator({ className, ...props }: ComponentProps<typeof CheckboxIndicatorPart>) {
  return (
    <CheckboxIndicatorPart
      className={mergeClassName("size-2.5 rounded-sm bg-accent", className)}
      {...props}
    />
  );
}

export { Checkbox, CheckboxGroup, CheckboxIndicator };
