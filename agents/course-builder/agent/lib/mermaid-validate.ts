import { mermaidStaticProblem } from "../../../../convex/lib/deck";

/**
 * Server-side Mermaid syntax check for generated decks, with Mermaid's own parser (`mermaid.parse`),
 * so a diagram that reaches the database is one the viewer can draw.
 *
 * Mermaid's parser imports DOMPurify, which needs a DOM when the module loads (not when it parses).
 * In Node there is none, so the first call borrows a jsdom `window`/`document` for the duration of
 * the import and removes them again: other code in the agent process must keep seeing a server
 * (no `window`). Convex cannot run this (no DOM, and the parser is large), which is why the check
 * lives in the agent and the engine keeps only the static checks.
 *
 * Node only (jsdom uses Node builtins): a workflow module must not import this file statically.
 * The `validateDiagrams` step in write-chapters.ts loads it with a dynamic import inside the step.
 */

/** Diagram types the deck viewer is themed for, as `mermaid.parse` names them. */
const SUPPORTED = new Set([
  "flowchart",
  "flowchart-v2",
  "sequence",
  "state",
  "stateDiagram",
  "class",
  "classDiagram",
  "er",
  "mindmap",
  "timeline",
  "gantt",
  "journey",
  "pie",
]);
const SUPPORTED_HINT =
  "flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, mindmap, timeline, gantt, journey or pie";

const ERROR_MAX = 600;

type Parser = { parse(code: string): Promise<{ diagramType: string }> };
let parser: Promise<Parser> | undefined;

async function loadParser(): Promise<Parser> {
  const scope = globalThis as { window?: unknown; document?: unknown };
  const borrowed = scope.window === undefined;
  if (borrowed) {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    scope.window = dom.window;
    scope.document = dom.window.document;
  }
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid as Parser;
  } finally {
    if (borrowed) {
      delete scope.window;
      delete scope.document;
    }
  }
}

/** Why `code` is not a diagram the viewer can draw, or null when it is. */
export async function mermaidProblem(code: string): Promise<string | null> {
  const fixed = mermaidStaticProblem(code);
  if (fixed) return fixed;
  parser ??= loadParser();
  let mermaid: Parser;
  try {
    mermaid = await parser;
  } catch (err) {
    parser = undefined; // let the next call try to load again
    throw err;
  }
  try {
    const { diagramType } = await mermaid.parse(code);
    if (!SUPPORTED.has(diagramType)) {
      return `mermaid: the diagram type "${diagramType}" is not supported; use ${SUPPORTED_HINT}`;
    }
    return null;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).trim();
    return `mermaid: ${message.length > ERROR_MAX ? `${message.slice(0, ERROR_MAX)}…` : message}`;
  }
}

/** `problems[i]` is null when `codes[i]` is valid. Throws only if the parser itself cannot load. */
export async function mermaidProblems(codes: string[]): Promise<(string | null)[]> {
  const problems: (string | null)[] = [];
  for (const code of codes) problems.push(await mermaidProblem(code));
  return problems;
}
