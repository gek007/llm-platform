import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return (await import("./auth.config")).default;
}

describe("convex auth config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // applicationID must match the `aud` claim that Clerk's Convex integration adds to session tokens.
  it("trusts Clerk session tokens issued by the deployment's Frontend API URL", async () => {
    vi.stubEnv("CLERK_FRONTEND_API_URL", "https://example-instance.clerk.accounts.dev");

    const config = await loadConfig();

    expect(config.providers).toEqual([
      { domain: "https://example-instance.clerk.accounts.dev", applicationID: "convex" },
    ]);
  });
});
