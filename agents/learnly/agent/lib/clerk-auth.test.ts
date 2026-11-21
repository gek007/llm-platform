import { ForbiddenError, UnauthenticatedError } from "eve/channels/auth";
import { describe, expect, test, vi } from "vitest";
import { authorizedParties, clerkAuth, hasProPlan, routeAuthWalk, type Verifier } from "./clerk-auth";

const req = (token?: string) =>
  new Request("http://x/eve/learnly/v1/session", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const future = Math.floor(Date.now() / 1000) + 60;
const ok = (claims: Record<string, unknown>): Verifier => async () =>
  ({ sub: "user_1", iss: "https://clerk.test", exp: future, ...claims }) as never;

describe("clerkAuth", () => {
  test("valid Pro token passes and yields the verified user", async () => {
    const result = await clerkAuth(ok({ pla: "u:free_user,u:pro" }))(req("t"));
    expect(result).toMatchObject({ principalId: "user_1", principalType: "user", authenticator: "clerk" });
    expect(result?.attributes).toMatchObject({ plan: "pro", convexToken: "t", tokenExp: String(future) });
  });

  test("admin without Pro passes", async () => {
    const result = await clerkAuth(ok({ pla: "u:free_user", metadata: { role: "admin" } }))(req("t"));
    expect(result?.attributes.plan).toBe("admin");
  });

  test("missing token skips so the walk returns 401", async () => {
    const verify = vi.fn();
    expect(await clerkAuth(verify)(req())).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  test("invalid or expired token is a 401", async () => {
    const bad: Verifier = async () => {
      throw new Error("expired");
    };
    await expect(clerkAuth(bad)(req("t"))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  test("pending sessions are rejected", async () => {
    await expect(clerkAuth(ok({ pla: "u:pro", sts: "pending" }))(req("t"))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  test("signed-in non-Pro is a 403", async () => {
    await expect(clerkAuth(ok({ pla: "u:free_user" }))(req("t"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(clerkAuth(ok({}))(req("t"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(clerkAuth(ok({ pla: "o:pro" }))(req("t"))).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("hasProPlan matches whole entries only", () => {
    expect(hasProPlan("u:pro")).toBe(true);
    expect(hasProPlan("u:pro_max")).toBe(false);
    expect(hasProPlan(undefined)).toBe(false);
  });

  test("walk has only Clerk auth by default; local dev is opt-in", () => {
    expect(routeAuthWalk({} as NodeJS.ProcessEnv)).toHaveLength(1);
    expect(routeAuthWalk({ TUTOR_ALLOW_LOCAL_DEV: "1" } as unknown as NodeJS.ProcessEnv)).toHaveLength(2);
    expect(routeAuthWalk({ TUTOR_ALLOW_LOCAL_DEV: "1", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toHaveLength(1);
  });

  test("authorized parties come from env, localhost only outside production", () => {
    expect(authorizedParties({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://a.test" } as never)).toEqual([
      "https://a.test",
    ]);
    expect(authorizedParties({ NODE_ENV: "development" } as never)).toContain("http://localhost:3000");
    expect(authorizedParties({ NODE_ENV: "production" } as never)).toBeUndefined();
  });
});
