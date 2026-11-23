import { describe, expect, it } from "vitest";
import { commandMessage, type EngineCommand } from "../../../../src/lib/course-builder/commands";
import { parseCommand } from "./command";

const cmds: EngineCommand[] = [
  { action: "research", jobId: "j1" },
  { action: "write", jobId: "j1" },
  {
    action: "regenerate",
    jobId: "j1",
    target: { kind: "subchapter", chapterOrder: 2, subchapterOrder: 3 },
    instruction: "Shorter, with an example.",
  },
];

describe("agent parseCommand (re-export of the dispatcher's format)", () => {
  it.each(cmds)("recovers %j from commandMessage", (cmd) => {
    expect(parseCommand(commandMessage(cmd))).toEqual(cmd);
  });

  it("returns null for a message without a command", () => {
    expect(parseCommand("hello")).toBeNull();
  });
});
