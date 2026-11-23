import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ResultsTable } from "./results-table";

const data: Record<string, unknown> = {};
vi.mock("@/components/admin/use-admin-query", () => ({
  useAdminQuery: (ref: { name: string }) => data[ref.name],
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: { tests: { resultsForCourse: { name: "resultsForCourse" } } },
}));

beforeEach(() => {
  data.resultsForCourse = {
    users: [
      { userId: "u1", name: "Ada", email: "ada@example.com" },
      { userId: "u2", name: "Bob" },
    ],
    tests: [
      { testId: "t1", chapterTitle: "Basics" },
      { testId: "t2", chapterTitle: "Deep" },
    ],
    cells: [
      { userId: "u1", testId: "t1", bestScore: 85, passed: true, attempts: 2 },
      { userId: "u2", testId: "t1", bestScore: 40, passed: false, attempts: 3 },
    ],
  };
});

describe("ResultsTable", () => {
  test("renders a pass cell, a fail cell and an empty cell", () => {
    render(<ResultsTable courseId={"c1" as never} />);
    expect(screen.getByRole("columnheader", { name: "Basics" })).toBeInTheDocument();
    expect(screen.getByText("85% ✓")).toBeInTheDocument();
    expect(screen.getByText("40% ✗")).toBeInTheDocument();
    expect(screen.getByLabelText("Ada, Basics: passed with 85% after 2 attempts")).toBeInTheDocument();
    expect(screen.getByLabelText("Bob, Basics: not passed, best 40% after 3 attempts")).toBeInTheDocument();
    expect(screen.getAllByText("Not attempted")).toHaveLength(2);
  });

  test("shows an empty state without tests or learners", () => {
    data.resultsForCourse = { users: [], tests: [], cells: [] };
    render(<ResultsTable courseId={"c1" as never} />);
    expect(screen.getByText("No chapter tests or attempts yet.")).toBeInTheDocument();
  });
});
