// @vitest-environment node
import { describe, expect, test } from "vitest";
import { channelAuth } from "./channel-auth";

const isLocalDev = (fn: unknown) => (fn as Record<symbol, unknown>)[Symbol.for("eve.channels.auth.localDev")] === true;

describe("course-builder channel auth", () => {
  test("only the HS256 JWT verifier when the secret is set; never localDev() on eve dev", () => {
    const walk = channelAuth({ COURSE_BUILDER_CHANNEL_SECRET: "s", EVE_DEV: "1" });
    expect(walk).toHaveLength(1);
    expect(walk.some(isLocalDev)).toBe(false);
  });

  test("no secret → an empty walk (every request 401)", () => {
    expect(channelAuth({})).toEqual([]);
  });

  test("adds localDev() only for the local server eve eval starts (EVE_EVALUATION=1 and a run id)", () => {
    const walk = channelAuth({ COURSE_BUILDER_CHANNEL_SECRET: "s", EVE_EVALUATION: "1", EVE_EVALUATION_RUN_ID: "run-1" });
    expect(walk).toHaveLength(2);
    expect(isLocalDev(walk[1])).toBe(true);
    expect(channelAuth({ EVE_EVALUATION: "0", EVE_EVALUATION_RUN_ID: "run-1" })).toEqual([]);
  });

  test("EVE_EVALUATION=1 alone (e.g. a stray .env.local line) keeps the walk jwtHmac-only", () => {
    for (const runId of [undefined, ""]) {
      const walk = channelAuth({ COURSE_BUILDER_CHANNEL_SECRET: "s", EVE_EVALUATION: "1", EVE_EVALUATION_RUN_ID: runId });
      expect(walk).toHaveLength(1);
      expect(walk.some(isLocalDev)).toBe(false);
    }
  });
});
