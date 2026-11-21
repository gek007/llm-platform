type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

type StatefulClassName<State> =
  | string
  | ((state: State) => string | undefined)
  | undefined;

// ui-sdk parts accept className as a string or a function of their state; keep both forms working.
export function mergeClassName<State>(
  base: string,
  className: StatefulClassName<State>,
): StatefulClassName<State> {
  if (typeof className === "function") {
    return (state) => cn(base, className(state));
  }
  return cn(base, className);
}
