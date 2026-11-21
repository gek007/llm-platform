import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PricingPlans } from "./pricing-plans";

const auth = vi.hoisted(() => ({
  state: { isLoaded: true, isSignedIn: false, pro: false },
}));
const checkoutProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
const openUserProfile = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: auth.state.isLoaded,
    isSignedIn: auth.state.isSignedIn,
    has: () => auth.state.pro,
  }),
  useClerk: () => ({ openUserProfile }),
  SignInButton: ({ children }: { children: ReactElement }) => (
    <div data-testid="sign-in-wrapper">{children}</div>
  ),
}));
vi.mock("@clerk/nextjs/experimental", () => ({
  CheckoutButton: ({ children, ...props }: Record<string, unknown> & { children: ReactElement }) => {
    checkoutProps.last = props;
    return <div data-testid="checkout-wrapper">{children}</div>;
  },
}));

beforeEach(() => {
  auth.state = { isLoaded: true, isSignedIn: false, pro: false };
  checkoutProps.last = null;
  openUserProfile.mockClear();
});

describe("PricingPlans", () => {
  test("toggle switches between yearly and monthly prices", async () => {
    const user = userEvent.setup();
    render(<PricingPlans proPlanId="cplan_1" />);

    const price = screen.getByTestId("pro-price");
    expect(price).toHaveTextContent("$190");
    expect(price).toHaveTextContent("per year");

    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(price).toHaveTextContent("$19");
    expect(price).toHaveTextContent("per month");

    await user.click(screen.getByRole("radio", { name: "Yearly" }));
    expect(price).toHaveTextContent("$190");
    expect(screen.getByText(/2 months free/)).toBeInTheDocument();
  });

  test("signed-out users are asked to sign in", () => {
    render(<PricingPlans proPlanId="cplan_1" />);
    expect(screen.getByTestId("sign-in-wrapper")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to upgrade" })).toBeInTheDocument();
  });

  test("signed-in free users get checkout with the chosen period", async () => {
    auth.state.isSignedIn = true;
    const user = userEvent.setup();
    render(<PricingPlans proPlanId="cplan_1" />);

    expect(checkoutProps.last).toMatchObject({ planId: "cplan_1", planPeriod: "annual" });
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(checkoutProps.last).toMatchObject({ planId: "cplan_1", planPeriod: "month" });
  });

  test("Pro users see their status and can manage the subscription", async () => {
    auth.state.isSignedIn = true;
    auth.state.pro = true;
    const user = userEvent.setup();
    render(<PricingPlans proPlanId="cplan_1" />);

    expect(screen.getByText("You're on Pro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(openUserProfile).toHaveBeenCalled();
  });

  test("a missing plan ID disables the button with a dev message", () => {
    render(<PricingPlans proPlanId={null} />);
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("NEXT_PUBLIC_CLERK_PRO_PLAN_ID");
  });

  test("an agent can drive the billing period control", async () => {
    const agent = createAgent();
    render(<PricingPlans proPlanId="cplan_1" />);

    const entries = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of entries) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }
    expect(entries.map((entry) => entry.label)).toContain("Billing period");

    const result = await agent.act({
      steps: [{ ref: "Billing period", action: "setValue", args: ["monthly"] }],
    });
    expect(result.ok, result.error?.message).toBe(true);
    expect(screen.getByTestId("pro-price")).toHaveTextContent("$19");
  });
});
