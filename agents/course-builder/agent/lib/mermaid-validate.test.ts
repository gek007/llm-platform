// @vitest-environment node
import { describe, expect, test } from "vitest";
import { fakeDeck } from "../../../../src/lib/course-builder/fake-deck";
import { mermaidProblem, mermaidProblems } from "./mermaid-validate";
import { validateDiagrams } from "./write-chapters";

// Runs in the node environment on purpose: this is the agent's runtime (no DOM).
describe("mermaidProblem (real parser, in Node)", () => {
  test("valid diagrams of the supported types parse", async () => {
    const valid = [
      "flowchart TD\n  A[Browser] --> B{Cached?}\n  B -- yes --> C[Answer]\n  B -- no --> D[Resolver]",
      "sequenceDiagram\n  participant C as Client\n  participant R as Resolver\n  C->>R: query\n  R-->>C: answer",
      "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: query",
      "classDiagram\n  class Zone {\n    +String name\n  }\n  Zone <|-- Root",
      "erDiagram\n  ZONE ||--o{ RECORD : contains",
      "mindmap\n  root((DNS))\n    Resolver\n    Root",
      "timeline\n  title History\n  1983 : DNS invented",
      'pie title Queries\n  "A" : 60\n  "AAAA" : 40',
      "flowchart LR\n  A[דפדפן] --> B[שרת]",
    ];
    for (const code of valid) expect(await mermaidProblem(code), code).toBeNull();
  });

  test("a syntax error comes back with the parser's message, which names the line", async () => {
    const problem = await mermaidProblem("flowchart TD\n  A[Browser --> B{Cache?");
    expect(problem).toMatch(/^mermaid: Parse error on line 2/);
    expect(await mermaidProblem("this is not a diagram\nat all")).toMatch(/^mermaid: No diagram type detected/);
  });

  test("unsupported types, directives and click handlers are refused", async () => {
    expect(await mermaidProblem("quadrantChart\n  title Reach\n  x-axis Low --> High\n  y-axis Low --> High\n  A: [0.3, 0.6]")).toMatch(
      /the diagram type "quadrantChart" is not supported; use flowchart/,
    );
    expect(await mermaidProblem("%%{init: {'theme':'forest'}}%%\nflowchart LR\n  A --> B")).toMatch(/init/);
    expect(await mermaidProblem('flowchart LR\n  A --> B\n  click A "https://x.example"')).toMatch(/click/);
  });

  test("loading the parser leaves no browser globals behind", async () => {
    await mermaidProblem("flowchart LR\n  A --> B");
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });

  test("mermaidProblems and the validateDiagrams step answer one entry per diagram, in order", async () => {
    const codes = ["flowchart LR\n  A --> B", "flowchart LR\n  A[ --> B", "flowchart LR\n  C --> D"];
    const problems = await mermaidProblems(codes);
    expect(problems[0]).toBeNull();
    expect(problems[1]).toMatch(/^mermaid: Parse error/);
    expect(problems[2]).toBeNull();
    expect(await validateDiagrams(codes)).toEqual({ ok: true, problems });
  });

  test("every diagram of the fake engine's canned deck parses", async () => {
    const codes = fakeDeck("Any chapter").flatMap((s) => (s.visual?.type === "mermaid" ? [s.visual.code] : []));
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(await mermaidProblem(code)).toBeNull();
  });
});
