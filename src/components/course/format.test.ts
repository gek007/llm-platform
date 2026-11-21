import { describe, expect, test } from "vitest";
import { formatDuration, lessonHref, percent, signInHref, stripLeadingTitle } from "./format";

describe("course format helpers", () => {
  test("formatDuration", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });
  test("hrefs and percent", () => {
    expect(lessonHref("a", "b")).toBe("/courses/a/lessons/b");
    expect(signInHref("/courses/a")).toBe("/sign-in?redirect_url=%2Fcourses%2Fa");
    expect(percent(1, 4)).toBe(25);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("stripLeadingTitle", () => {
  test("drops a leading heading that repeats the title", () => {
    expect(stripLeadingTitle("# Why types?\n\nBody text", "Why types?")).toBe("Body text");
    expect(stripLeadingTitle("## why TYPES?\nBody", "Why types?")).toBe("Body");
  });

  test("keeps the body when the first heading is different or absent", () => {
    expect(stripLeadingTitle("# Intro\n\nBody", "Why types?")).toBe("# Intro\n\nBody");
    expect(stripLeadingTitle("Body\n# Why types?", "Why types?")).toBe("Body\n# Why types?");
    expect(stripLeadingTitle("### Why types?\nBody", "Why types?")).toBe("### Why types?\nBody");
  });
});
