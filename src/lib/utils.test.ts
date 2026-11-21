import { describe, expect, test } from "vitest";
import { cn, mergeClassName } from "./utils";

describe("cn", () => {
  test("joins truthy classes and drops the rest", () => {
    expect(cn("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });

  test("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null)).toBe("");
  });
});

describe("mergeClassName", () => {
  test("appends a string className to the base", () => {
    expect(mergeClassName("base", "extra")).toBe("base extra");
  });

  test("keeps the base when className is undefined", () => {
    expect(mergeClassName("base", undefined)).toBe("base");
  });

  test("wraps a state function so the base is always included", () => {
    const merged = mergeClassName<{ open: boolean }>("base", (state) =>
      state.open ? "is-open" : undefined,
    );
    if (typeof merged !== "function") throw new Error("expected a function");
    expect(merged({ open: true })).toBe("base is-open");
    expect(merged({ open: false })).toBe("base");
  });
});
