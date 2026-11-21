import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { EnrollButton, type EnrollViewer } from "./enroll-button";

// The spy only records calls; the behavior is a plain function so vitest does not track rejected promises.
const enroll = vi.fn();
let behavior: () => Promise<unknown> = () => Promise.resolve("id");
vi.mock("convex/react", () => ({
  useMutation: () => (...args: unknown[]) => {
    enroll(...args);
    return behavior();
  },
}));

const courseId = "course1" as Id<"courses">;
const base = { courseId, courseSlug: "ts", tier: "free" as const, enrolled: false, continueHref: "/courses/ts/lessons/a" };
const viewer = (v: Partial<EnrollViewer> = {}): EnrollViewer => ({ signedIn: true, isPro: false, isAdmin: false, ...v });

beforeEach(() => {
  enroll.mockReset();
  behavior = () => Promise.resolve("id");
});

describe("EnrollButton", () => {
  test("signed out links to sign in with a return path", () => {
    render(<EnrollButton {...base} viewer={viewer({ signedIn: false })} />);
    expect(screen.getByRole("link", { name: "Sign in to enroll" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Fcourses%2Fts",
    );
  });

  test("pro course without Pro shows the upgrade link", () => {
    render(<EnrollButton {...base} tier="pro" viewer={viewer()} />);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("button", { name: "Enroll" })).toBeNull();
  });

  test("enrolled shows Continue", () => {
    render(<EnrollButton {...base} enrolled viewer={viewer()} />);
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/courses/ts/lessons/a");
  });

  test("enrolls on click", async () => {
        render(<EnrollButton {...base} viewer={viewer()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll" }));
    expect(enroll).toHaveBeenCalledWith({ courseId });
  });

  test("PRO_REQUIRED from the server swaps in the upgrade link", async () => {
    behavior = () => Promise.reject(new ConvexError("PRO_REQUIRED"));
    render(<EnrollButton {...base} viewer={viewer()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll" }));
    expect(await screen.findByRole("link", { name: "Upgrade to Pro" })).toBeInTheDocument();
  });

  test("other errors show an alert", async () => {
    behavior = () => Promise.reject(new Error("boom"));
    render(<EnrollButton {...base} viewer={viewer()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Enroll" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not enroll");
  });
});
