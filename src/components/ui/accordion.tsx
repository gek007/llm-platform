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
        "divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800",
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
        "group flex w-full items-center justify-between gap-4 px-4 py-3 text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 data-disabled:text-zinc-500 dark:focus-visible:outline-zinc-100",
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
      className={mergeClassName("px-4 pb-4 text-zinc-600 dark:text-zinc-400", className)}
      {...props}
    />
  );
}

export { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger };
