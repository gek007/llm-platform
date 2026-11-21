import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TutorWidget } from "./tutor-widget";

const auth = vi.fn();
let pathname = "/";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth() }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("./tutor-chat", () => ({
  TutorChat: ({ pageContext }: { pageContext?: { lessonSlug?: string } }) => (
    <div>chat lesson={pageContext?.lessonSlug ?? "none"}</div>
  ),
}));

const signedIn = (extra: Record<string, unknown> = {}) => ({
  isLoaded: true,
  isSignedIn: true,
  has: () => false,
  sessionClaims: {},
  ...extra,
});

describe("TutorWidget", () => {
  beforeEach(() => {
    pathname = "/";
    auth.mockReset();
  });

  test("renders nothing for signed-out users and while loading", () => {
    auth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { container, rerender } = render(<TutorWidget />);
    expect(container).toBeEmptyDOMElement();
    auth.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    rerender(<TutorWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  test.each(["/admin", "/admin/courses", "/sign-in", "/sign-up/verify"])("hidden on %s", (p) => {
    pathname = p;
    auth.mockReturnValue(signedIn({ has: () => true }));
    const { container } = render(<TutorWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  test("non-Pro users get a locked teaser linking to /pricing, no chat", async () => {
    auth.mockReturnValue(signedIn());
    render(<TutorWidget />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Learnly tutor (Pro feature)" }));
    expect(screen.getByRole("link", { name: "See Pro plans" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByText(/chat lesson=/)).not.toBeInTheDocument();
  });

  test("Pro users open the chat with the parsed lesson context", async () => {
    pathname = "/courses/ts/lessons/intro";
    auth.mockReturnValue(signedIn({ has: ({ plan }: { plan: string }) => plan === "pro" }));
    render(<TutorWidget />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Open Learnly tutor" }));
    expect(screen.getByText("chat lesson=intro")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Learnly tutor" })).toBeInTheDocument();
  });

  test("admins get the chat without a Pro plan", async () => {
    auth.mockReturnValue(signedIn({ sessionClaims: { metadata: { role: "admin" } } }));
    render(<TutorWidget />);
    expect(screen.getByRole("button", { name: "Open Learnly tutor" })).toBeInTheDocument();
  });

  test("a UI SDK agent can see the named tutor popover", () => {
    auth.mockReturnValue(signedIn({ has: () => true }));
    const uiAgent = createAgent();
    render(<TutorWidget />);
    const labels = uiAgent.snapshot().map((e) => e.label);
    expect(labels).toContain("Learnly tutor");
  });
});
