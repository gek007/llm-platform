import {
  Accordion as AccordionRoot,
  AccordionHeader,
  AccordionItem,
  AccordionPanel as AccordionPanelPart,
  AccordionTrigger as AccordionTriggerPart,
} from "@ui-sdk/react/accordion";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/lib/utils";

function Accordion({ className, ...props }: ComponentProps<typeof AccordionRoot>) {
  return (
    <AccordionRoot
      className={mergeClassName(
        "divide-y divide-line rounded-lg border border-line",
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionTriggerPart>) {
  return (
    <AccordionTriggerPart
      className={mergeClassName(
        "group flex w-full items-center justify-between gap-4 px-4 py-3 text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-disabled:text-subtle",
        className,
      )}
      {...props}
    >
      {typeof children === "function"
        ? (state) => (
            <>
              {children(state)}
              <Chevron />
            </>
          )
        : (
            <>
              {children}
              <Chevron />
            </>
          )}
    </AccordionTriggerPart>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 -rotate-90 transition-transform group-data-open:rotate-0 rtl:rotate-90"
    >
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function AccordionPanel({ className, ...props }: ComponentProps<typeof AccordionPanelPart>) {
  return (
    <AccordionPanelPart
      className={mergeClassName("px-4 pb-4 text-muted", className)}
      {...props}
    />
  );
}

export { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger };
