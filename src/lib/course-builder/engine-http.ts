/**
 * Server-side client for the Convex `/engine/*` HTTP API (see convex/http.ts). Used by the fake
 * engine; the real agent has its own client. Server code only: it holds `COURSE_ENGINE_SECRET`
 * (the project does not use the `server-only` package; this module is only imported from route
 * handlers and server libs). Never logs the secret or the Authorization header.
 */

export type EngineHttp = (op: string, body: unknown) => Promise<unknown>;

type Options = { baseUrl?: string; secret?: string; fetch?: typeof fetch };

/** `CONVEX_SITE_URL`, else `NEXT_PUBLIC_CONVEX_SITE_URL`, else `NEXT_PUBLIC_CONVEX_URL` with `.convex.cloud` -> `.convex.site`. */
function defaultBaseUrl(): string {
  const site =
    process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (site) return site;
  return (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(
    /\.convex\.cloud\/?$/,
    ".convex.site",
  );
}

export function createEngineHttp(options: Options = {}): EngineHttp {
  return async (op, body) => {
    const baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
    const secret = options.secret ?? process.env.COURSE_ENGINE_SECRET ?? "";
    if (!baseUrl || !secret)
      throw new Error(
        "Course engine is not configured (site URL or secret missing)",
      );
    const res = await (options.fetch ?? fetch)(`${baseUrl}/engine/${op}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().then(
      (v) => v as { ok?: boolean; error?: string } | null,
      () => null, // not JSON; reported below
    );
    if (!json) throw new Error(`Engine ${op} failed with HTTP ${res.status}`);
    if (!json.ok)
      throw new Error(
        json.error || `Engine ${op} failed with HTTP ${res.status}`,
      );
    return json;
  };
}

export const engineHttp: EngineHttp = createEngineHttp();
