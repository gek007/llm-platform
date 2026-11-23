import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { LessonSources } from "./lesson-sources";

describe("LessonSources", () => {
  test("renders external links", () => {
    render(<LessonSources sources={[{ title: "Guide", url: "https://example.com/g", kind: "web" }]} />);
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Guide" });
    expect(link).toHaveAttribute("href", "https://example.com/g");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
  test("renders nothing without sources", () => {
    const { container } = render(<LessonSources sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
