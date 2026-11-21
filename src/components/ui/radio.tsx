import {
  Radio as RadioPart,
  RadioGroup as RadioGroupPart,
  RadioIndicator as RadioIndicatorPart,
} from "@ui-sdk/react/radio";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPart>) {
  return <RadioGroupPart className={mergeClassName("flex flex-col gap-2", className)} {...props} />;
}

function Radio({ className, ...props }: ComponentProps<typeof RadioPart>) {
  return (
    <RadioPart
      className={mergeClassName(
        "grid size-5 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function RadioIndicator({ className, ...props }: ComponentProps<typeof RadioIndicatorPart>) {
  return (
    <RadioIndicatorPart
      className={mergeClassName("size-2.5 rounded-full bg-accent", className)}
      {...props}
    />
  );
}

export { Radio, RadioGroup, RadioIndicator };
