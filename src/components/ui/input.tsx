import {
  Input as InputPart,
  InputClear as InputClearPart,
  InputGroup as InputGroupPart,
} from "@ui-sdk/react/input";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

function Input({ className, ...props }: ComponentProps<typeof InputPart>) {
  return (
    <InputPart
      className={mergeClassName(
        "w-full rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2 text-sm text-fg placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function InputGroup({
  className,
  ...props
}: ComponentProps<typeof InputGroupPart>) {
  return (
    <InputGroupPart
      className={mergeClassName(
        "flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

function InputClear({
  className,
  ...props
}: ComponentProps<typeof InputClearPart>) {
  return (
    <InputClearPart
      className={mergeClassName(
        "rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export { Input, InputClear, InputGroup };
