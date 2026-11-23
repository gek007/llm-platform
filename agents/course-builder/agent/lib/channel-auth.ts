import { jwtHmac, localDev } from "eve/channels/auth";
import { CHANNEL_JWT } from "../../../../src/lib/course-builder/eve-client";

/**
 * The course-builder channel's auth walk (channels/eve.ts). Service-to-service only: the Next.js
 * `/api/course-builder/*` routes sign a 60 s HS256 JWT with COURSE_BUILDER_CHANNEL_SECRET
 * (src/lib/course-builder/eve-client.ts). No browser auth, and no localDev() on `eve dev`: every
 * request needs a valid token. Without the secret the walk is empty, so every request gets 401
 * (never verify against an empty key).
 *
 * One exception: `eve eval` sets EVE_EVALUATION=1 for the local server it starts itself, and its
 * client sends no credentials. Only then is localDev() added, which eve still limits to a local
 * development server and loopback, non-cross-site requests (it rejects everything in production).
 */
export function channelAuth(env: Record<string, string | undefined> = process.env) {
  const secret = env.COURSE_BUILDER_CHANNEL_SECRET;
  const walk = secret
    ? [
        jwtHmac({
          algorithm: "HS256",
          issuer: CHANNEL_JWT.issuer,
          audiences: [CHANNEL_JWT.audience],
          subjects: [CHANNEL_JWT.subject],
          secret,
        }),
      ]
    : [];
  return env.EVE_EVALUATION === "1" ? [...walk, localDev()] : walk;
}
