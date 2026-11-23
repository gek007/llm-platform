/**
 * The command the dispatcher sends to the course-builder agent (and the fake engine). It travels as
 * a chat message: one human-readable line plus a fenced `json` block, so the agent can read it and
 * `parseCommand` can recover it deterministically. Pure: no server imports (the agent re-exports
 * `parseCommand`).
 */

export type RegenerateTarget = {
  kind: "subchapter" | "deck" | "test" | "chapter";
  chapterOrder: number;
  subchapterOrder?: number;
};

export type EngineCommand =
  | { action: "research"; jobId: string }
  | { action: "write"; jobId: string }
  | {
      action: "regenerate";
      jobId: string;
      target: RegenerateTarget;
      instruction: string;
    };

const TARGET_KINDS = ["subchapter", "deck", "test", "chapter"];

const isOrder = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseTarget(raw: unknown): RegenerateTarget | null {
  if (
    !isRecord(raw) ||
    typeof raw.kind !== "string" ||
    !TARGET_KINDS.includes(raw.kind)
  )
    return null;
  if (!isOrder(raw.chapterOrder)) return null;
  const kind = raw.kind as RegenerateTarget["kind"];
  if (kind === "subchapter") {
    if (!isOrder(raw.subchapterOrder)) return null;
    return {
      kind,
      chapterOrder: raw.chapterOrder,
      subchapterOrder: raw.subchapterOrder,
    };
  }
  if (raw.subchapterOrder !== undefined) return null;
  return { kind, chapterOrder: raw.chapterOrder };
}

/** Validates an untrusted value (a parsed JSON block or a route body) into a command, or null. */
export function toCommand(raw: unknown): EngineCommand | null {
  if (!isRecord(raw) || typeof raw.jobId !== "string" || raw.jobId === "")
    return null;
  const jobId = raw.jobId;
  if (raw.action === "research" || raw.action === "write")
    return { action: raw.action, jobId };
  if (raw.action === "regenerate") {
    const target = parseTarget(raw.target);
    if (!target || typeof raw.instruction !== "string") return null;
    return {
      action: "regenerate",
      jobId,
      target,
      instruction: raw.instruction,
    };
  }
  return null;
}

function describe(cmd: EngineCommand): string {
  switch (cmd.action) {
    case "research":
      return `Research the course for job ${cmd.jobId} and save an outline.`;
    case "write":
      return `Write the approved course for job ${cmd.jobId}.`;
    case "regenerate": {
      const { kind, chapterOrder, subchapterOrder } = cmd.target;
      const where = subchapterOrder
        ? `${chapterOrder}.${subchapterOrder}`
        : `chapter ${chapterOrder}`;
      return `Regenerate the ${kind} (${where}) for job ${cmd.jobId}.`;
    }
  }
}

/** One readable line, then the command as a fenced `json` block. Deterministic. */
export function commandMessage(cmd: EngineCommand): string {
  return `${describe(cmd)}\n\n\`\`\`json\n${JSON.stringify(cmd)}\n\`\`\``;
}

/** Recovers the command from a `commandMessage` (anywhere in `text`); null on anything malformed. */
export function parseCommand(text: string): EngineCommand | null {
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(text);
  if (!match) return null;
  try {
    return toCommand(JSON.parse(match[1]));
  } catch {
    return null;
  }
}
