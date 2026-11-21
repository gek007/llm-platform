import { verifyToken } from "@clerk/backend";
import {
  extractBearerToken,
  ForbiddenError,
  localDev,
  UnauthenticatedError,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

type Claims = {
  sub: string;
  iss?: string;
  exp: number;
  azp?: string;
  sts?: string;
  pla?: unknown;
  metadata?: { role?: unknown };
};

export type Verifier = (token: string) => Promise<Claims>;

/** Origins allowed as the token's `azp` claim (the page that minted it). */
export function authorizedParties(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  const parties = new Set<string>();
  for (const v of (env.TUTOR_AUTHORIZED_PARTIES ?? "").split(",")) if (v.trim()) parties.add(v.trim());
  if (env.NEXT_PUBLIC_APP_URL) parties.add(env.NEXT_PUBLIC_APP_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) parties.add(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (env.VERCEL_URL) parties.add(`https://${env.VERCEL_URL}`);
  if (env.NODE_ENV !== "production") {
    parties.add("http://localhost:3000");
    parties.add("http://localhost:3001");
  }
  return parties.size > 0 ? [...parties] : undefined;
}

/** Real verification: signature, expiry, `azp`. Networkless when CLERK_JWT_KEY is set, otherwise JWKS via the secret key. */
export const clerkVerifier: Verifier = async (token) => {
  const result = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    jwtKey: process.env.CLERK_JWT_KEY,
    authorizedParties: authorizedParties(),
  });
  if (result.errors || !result.data) throw new Error("invalid token");
  return result.data as unknown as Claims;
};

export function hasProPlan(pla: unknown): boolean {
  return typeof pla === "string" && pla.split(",").some((p) => p.trim() === "u:pro");
}

export function isAdminClaims(claims: Pick<Claims, "metadata">): boolean {
  return claims.metadata?.role === "admin";
}

export const TOKEN_ATTRIBUTE = "convexToken";
export const TOKEN_EXP_ATTRIBUTE = "tokenExp";

/**
 * Route auth: verifies the Clerk session token sent as a Bearer header.
 * No token: skip (401 from the walk). Bad/expired token: 401. Signed in but not Pro/admin: 403.
 * The verified user ID becomes the principal; the same short-lived token is forwarded to tools so
 * Convex applies its own auth (the client never supplies a user ID).
 */
export function clerkAuth(verify: Verifier = clerkVerifier): AuthFn<Request> {
  return withAuthChallenges(async (request: Request): Promise<SessionAuthContext | null> => {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) return null;

    let claims: Claims;
    try {
      claims = await verify(token);
    } catch {
      throw new UnauthenticatedError({ code: "invalid_token", message: "Your session is invalid or expired. Sign in again." });
    }
    if (!claims.sub || claims.sts === "pending") {
      throw new UnauthenticatedError({ code: "invalid_token", message: "Your session is not active." });
    }

    const admin = isAdminClaims(claims);
    if (!admin && !hasProPlan(claims.pla)) {
      throw new ForbiddenError({ message: "The AI tutor is available to Pro members." });
    }

    return {
      authenticator: "clerk",
      issuer: claims.iss,
      principalId: claims.sub,
      principalType: "user",
      attributes: {
        plan: admin ? "admin" : "pro",
        [TOKEN_ATTRIBUTE]: token,
        [TOKEN_EXP_ATTRIBUTE]: String(claims.exp),
      },
    };
  }, [{ scheme: "Bearer" }]);
}

/** Local-dev bypass is opt-in only (`TUTOR_ALLOW_LOCAL_DEV=1`), off by default. Tools get no user token under it. */
export function routeAuthWalk(env: NodeJS.ProcessEnv = process.env): AuthFn<Request>[] {
  const walk: AuthFn<Request>[] = [clerkAuth()];
  if (env.TUTOR_ALLOW_LOCAL_DEV === "1" && env.NODE_ENV !== "production") walk.push(localDev());
  return walk;
}
