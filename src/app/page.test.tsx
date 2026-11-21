import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// The catalog is an async server component (Convex fetch), covered in e2e/landing.spec.ts.
vi.mock("@/components/landing/course-catalog", () => ({
  CourseCatalog: () => <p>catalog</p>,
  CourseCatalogSkeleton: () => <p>loading catalog</p>,
}));

import Home from "./page";

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

describe("Home page", () => {
  test("has one h1 and the landing sections in order", () => {
    render(<Home />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("knows where you are");

    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      "Pick a path and start today",
      "Every course, built the same careful way",
      expect.stringContaining("Taught by"),
      "Start free. Go Pro when you are ready.",
      expect.stringContaining("Your next skill"),
    ]);
  });

  test("links to courses and pricing", () => {
    render(<Home />);
    expect(screen.getAllByRole("link", { name: "Browse courses" })[0]).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: "Compare plans" })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/sign-up");
  });
});
