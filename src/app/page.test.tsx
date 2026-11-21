import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { describe, expect, test } from "vitest";
import Home from "./page";

const sections = ["Authentication", "Backend", "Hosting", "Interface"];

describe("Home page", () => {
  test("shows the platform name and its stack", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "LMS Platform" }),
    ).toBeInTheDocument();
    for (const name of sections) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  test("opens one stack section at a time from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const auth = screen.getByRole("button", { name: "Authentication" });
    const backend = screen.getByRole("button", { name: "Backend" });

    await user.tab();
    expect(auth).toHaveFocus();
    await user.keyboard(" ");
    expect(auth).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: "Authentication" }),
    ).toHaveTextContent("Clerk");

    await user.tab();
    expect(backend).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(backend).toHaveAttribute("aria-expanded", "true");
    expect(auth).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: "Backend" })).toHaveTextContent(
      "Convex",
    );

    await user.keyboard("{Enter}");
    expect(backend).toHaveAttribute("aria-expanded", "false");
  });

  test("an agent can find and open every stack section", async () => {
    const agent = createAgent();
    render(<Home />);

    const components = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }
    expect(components.map((entry) => entry.label)).toContain("Platform stack");

    const result = await agent.act({
      steps: [{ ref: "Platform stack", action: "open", args: ["Hosting"] }],
    });
    expect(result.ok, result.error?.message).toBe(true);
    expect(screen.getByRole("region", { name: "Hosting" })).toHaveTextContent(
      "Vercel",
    );
  });
});
