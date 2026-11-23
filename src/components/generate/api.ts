export type ActionResult = { ok: true } | { ok: false; status: number; error: string; jobStatus?: string };

/** POSTs to the course-builder route. 409 carries the job's current status; 502 means dispatch failed. */
export async function postAction(
  action: "start" | "approve" | "regenerate" | "resume",
  body: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const response = await fetch(`/api/course-builder/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => ({}))) as { error?: string; status?: string };
    return { ok: false, status: response.status, error: data.error ?? "Request failed", jobStatus: data.status };
  } catch {
    return { ok: false, status: 0, error: "Network error. Try again." };
  }
}

export function describeFailure(result: Extract<ActionResult, { ok: false }>): string {
  if (result.status === 409) return `The job is already ${result.jobStatus ?? "in another state"}; showing its current status.`;
  if (result.status === 502) return `The engine could not be reached: ${result.error}. Use Resume to retry.`;
  return result.error;
}
