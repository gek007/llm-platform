import { Button as ButtonPart } from "@ui-sdk/react/button";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ComponentProps<typeof ButtonPart> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-soft hover:bg-accent-soft font-semibold",
  secondary:
    "border border-line-strong bg-surface-2 text-fg hover:border-accent/60 hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
};

function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <ButtonPart
      className={mergeClassName(
        `inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-disabled:cursor-not-allowed data-disabled:opacity-50 data-pending:opacity-70 ${variantClasses[variant]}`,
        className,
      )}
      {...props}
    />
  );
}

export { Button };
export type { ButtonProps, ButtonVariant };
