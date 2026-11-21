// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signPlaybackTokens, TOKEN_TTL_SECONDS } from "./playback";

const part = (token: string, i: number) =>
  JSON.parse(Buffer.from(token.split(".")[i], "base64url").toString("utf8")) as Record<string, unknown> & { exp: number };

describe("signPlaybackTokens", () => {
  it("signs RS256 playback, thumbnail and storyboard tokens with a ~2h expiry", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const keySecret = Buffer.from(pem).toString("base64"); // Mux returns the key base64-encoded
    const now = Date.now();
    const out = await signPlaybackTokens("pb1", { keyId: "kid1", keySecret }, now);

    for (const [token, aud] of [
      [out.playback, "v"],
      [out.thumbnail, "t"],
      [out.storyboard, "s"],
    ] as const) {
      const header = part(token, 0);
      const claims = part(token, 1);
      expect(header).toMatchObject({ alg: "RS256" })
      expect(claims.kid).toBe("kid1");
      expect(claims.sub).toBe("pb1");
      expect(claims.aud).toBe(aud);
      expect(claims.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(TOKEN_TTL_SECONDS - 60);
      expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(TOKEN_TTL_SECONDS);
    }
    expect(out.expiresAt).toBe(now + TOKEN_TTL_SECONDS * 1000);
  });
});
