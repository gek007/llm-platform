import { ForbiddenError, UnauthenticatedError } from "eve/channels/auth";
import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authorizedParties, clerkAuth, clerkVerifier, hasProPlan, routeAuthWalk, type Verifier } from "./clerk-auth";

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

// Exercises the real @clerk/backend verifyToken (networkless via CLERK_JWT_KEY), so a change in its
// return shape can't silently reject every valid token again.
describe("clerkVerifier (real verifyToken)", () => {
  const SESSION_CAT = "cl_B7d4PD111AAA";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const sign = (claims: Record<string, unknown>) => {
    // Clerk session tokens carry `cat: "cl_B7d4PD111AAA"` (session-token category) in the header.
    const unsigned = `${b64({ alg: "RS256", typ: "JWT", cat: SESSION_CAT })}.${b64(claims)}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
    return `${unsigned}.${signature}`;
  };
  const now = Math.floor(Date.now() / 1000);
  const base = { sub: "user_123", iss: "https://example.clerk.accounts.dev", iat: now, nbf: now, exp: now + 60, azp: "http://localhost:3000" };

  beforeEach(() => {
    vi.stubEnv("CLERK_JWT_KEY", publicKey.export({ type: "spki", format: "pem" }).toString());
    vi.stubEnv("CLERK_SECRET_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  test("returns the claims of a valid token", async () => {
    const claims = await clerkVerifier(sign({ ...base, pla: "u:pro" }));
    expect(claims.sub).toBe("user_123");
    expect(claims.pla).toBe("u:pro");
  });

  test("rejects an expired token", async () => {
    await expect(clerkVerifier(sign({ ...base, iat: now - 600, nbf: now - 600, exp: now - 300 }))).rejects.toThrow();
  });

  test("rejects a token minted for another origin", async () => {
    await expect(clerkVerifier(sign({ ...base, azp: "https://evil.example" }))).rejects.toThrow();
  });

  test("rejects a token signed with a different key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const unsigned = `${b64({ alg: "RS256", typ: "JWT", cat: SESSION_CAT })}.${b64(base)}`;
    const forged = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(other).toString("base64url")}`;
    await expect(clerkVerifier(forged)).rejects.toThrow();
  });

  test("a valid admin token passes the full route auth", async () => {
    const auth = clerkAuth();
    const request = new Request("http://localhost/eve/learnly/v1/session", {
      method: "POST",
      headers: { authorization: `Bearer ${sign({ ...base, pla: "u:free_user", metadata: { role: "admin" } })}` },
    });
    const result = await auth(request);
    expect(result && "principalId" in result ? result.principalId : null).toBe("user_123");
  });
});
