import { describe, expect, test } from "vitest";
import { describePageContext, parsePathname, readPageContext } from "./page-context";

describe("page context", () => {
  test("parses course and lesson slugs", () => {
    expect(parsePathname("/courses/ts-basics/lessons/intro")).toEqual({
      pathname: "/courses/ts-basics/lessons/intro",
      courseSlug: "ts-basics",
      lessonSlug: "intro",
    });
    expect(parsePathname("/courses/ts-basics/")).toEqual({ pathname: "/courses/ts-basics/", courseSlug: "ts-basics" });
    expect(parsePathname("/pricing")).toEqual({ pathname: "/pricing" });
    expect(parsePathname("/courses/a/lessons/b?x=1#h").lessonSlug).toBe("b");
  });

  test("rejects odd slugs", () => {
    expect(parsePathname("/courses/Bad_Slug/lessons/x").courseSlug).toBeUndefined();
    expect(parsePathname("/courses/ok/lessons/..%2F..").lessonSlug).toBeUndefined();
  });

  test("server re-derives slugs and ignores client-supplied ones", () => {
    const ctx = readPageContext({ pathname: "/courses/a/lessons/b", courseSlug: "evil", lessonSlug: "evil" });
    expect(ctx).toEqual({ pathname: "/courses/a/lessons/b", courseSlug: "a", lessonSlug: "b" });
    expect(readPageContext("nope")).toBeNull();
    expect(readPageContext({ pathname: 5 })).toBeNull();
  });

  test("describes context as an unverified hint", () => {
    expect(describePageContext(parsePathname("/courses/a/lessons/b"))).toContain("Lesson slug: b");
    expect(describePageContext(null)).toContain("unknown");
  });
});
