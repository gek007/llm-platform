import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SiteHeader } from "./site-header";

const auth = vi.hoisted(() => ({ signedIn: false, role: undefined as string | undefined }));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    (when === "signed-in") === auth.signedIn ? <>{children}</> : null,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <span>user menu</span>,
  useUser: () => ({ user: auth.signedIn ? { publicMetadata: { role: auth.role } } : null }),
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    auth.signedIn = false;
    auth.role = undefined;
  });

  test("signed-out visitors see the public links and no My Learning link", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("Courses");
    expect(nav).toHaveTextContent("Pricing");
    expect(screen.queryByRole("link", { name: "My Learning" })).not.toBeInTheDocument();
  });

  test("signed-in students see My Learning (linking to /dashboard) but not Admin", () => {
    auth.signedIn = true;
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "My Learning" });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  test("admins also see Admin", () => {
    auth.signedIn = true;
    auth.role = "admin";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });
});
