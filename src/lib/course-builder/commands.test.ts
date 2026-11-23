import { describe, expect, it } from "vitest";
import { commandMessage, parseCommand, type EngineCommand } from "./commands";

const cmds: EngineCommand[] = [
  { action: "research", jobId: "j1" },
  { action: "write", jobId: "j1" },
  {
    action: "regenerate",
    jobId: "j1",
    target: { kind: "subchapter", chapterOrder: 2, subchapterOrder: 1 },
    instruction: 'Make it shorter, with "quotes" and\nnewlines.',
  },
  {
    action: "regenerate",
    jobId: "j1",
    target: { kind: "deck", chapterOrder: 1 },
    instruction: "",
  },
];

describe("course-builder commands", () => {
  it.each(cmds)("round-trips %j", (cmd) => {
    const text = commandMessage(cmd);
    expect(parseCommand(text)).toEqual(cmd);
    expect(commandMessage(cmd)).toBe(text); // deterministic
    expect(text.split("\n")[0]).toMatch(/\S/);
    expect(text).toContain("```json");
  });

  it("parses a command embedded in surrounding text", () => {
    expect(parseCommand(`hi\n${commandMessage(cmds[0])}\nthanks`)).toEqual(
      cmds[0],
    );
  });

  it.each([
    "",
    "hello",
    "```json\nnot json\n```",
    '```json\n{"action":"nuke","jobId":"j"}\n```',
    '```json\n{"action":"research"}\n```',
    '```json\n{"action":"research","jobId":""}\n```',
    '```json\n{"action":"regenerate","jobId":"j","instruction":"x"}\n```',
    '```json\n{"action":"regenerate","jobId":"j","instruction":"x","target":{"kind":"video","chapterOrder":1}}\n```',
    '```json\n{"action":"regenerate","jobId":"j","instruction":"x","target":{"kind":"deck","chapterOrder":0}}\n```',
    '```json\n{"action":"regenerate","jobId":"j","instruction":"x","target":{"kind":"subchapter","chapterOrder":1}}\n```',
    '```json\n{"action":"regenerate","jobId":"j","target":{"kind":"deck","chapterOrder":1}}\n```',
    "```json\n[1]\n```",
  ])("returns null for garbage %j", (text) => {
    expect(parseCommand(text)).toBeNull();
  });
});
