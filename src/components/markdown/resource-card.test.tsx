import { render, screen } from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ResourceCard } from "./resource-card";

let result: unknown;
vi.mock("convex/react", () => ({ useQuery: () => result }));

beforeEach(() => {
  result = undefined;
});

describe("ResourceCard", () => {
  test("shows a loading placeholder, then a download link for a pdf", () => {
    const { rerender } = render(<ResourceCard resourceId="r1" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    result = { title: "Cheat sheet", kind: "pdf", url: "https://files.example/a.pdf" };
    rerender(<ResourceCard resourceId="r1" />);
    const link = screen.getByRole("link", { name: "Download Cheat sheet" });
    expect(link).toHaveAttribute("href", "https://files.example/a.pdf");
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });
  test("shows an unavailable notice when the resource resolves to null", () => {
    result = null;
    render(<ResourceCard resourceId="r1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/not available/i);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  test("renders no anchor for a non-http url", () => {
    result = { title: "Bad", kind: "url", url: "javascript:alert(1)" };
    render(<ResourceCard resourceId="r1" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  test("an agent can find the resource link", () => {
    result = { title: "Cheat sheet", kind: "url", url: "https://example.com/x" };
    const agent = createAgent();
    render(<ResourceCard resourceId="r1" />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toContain("Open Cheat sheet");
  });
});
