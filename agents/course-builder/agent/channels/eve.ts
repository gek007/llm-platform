import { jwtHmac } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { CHANNEL_JWT } from "../../../../src/lib/course-builder/eve-client";

const secret = process.env.COURSE_BUILDER_CHANNEL_SECRET;

/**
 * Service-to-service only: the Next.js `/api/course-builder/*` routes sign a 60 s HS256 JWT with
 * COURSE_BUILDER_CHANNEL_SECRET (src/lib/course-builder/eve-client.ts). No localDev(), no browser
 * auth: every request, even on `eve dev`, needs a valid token. Without the secret the walk is empty,
 * so every request gets 401 (never verify against an empty key).
 */
export default eveChannel({
  auth: secret
    ? [
        jwtHmac({
          algorithm: "HS256",
          issuer: CHANNEL_JWT.issuer,
          audiences: [CHANNEL_JWT.audience],
          subjects: [CHANNEL_JWT.subject],
          secret,
        }),
      ]
    : [],
});
