// One command format for both sides (R8): the dispatcher writes it with `commandMessage`, the agent
// reads it with `parseCommand`. Both live in src/lib/course-builder/commands.ts (pure, no server imports).
export { parseCommand } from "../../../../src/lib/course-builder/commands";
export type { EngineCommand, RegenerateTarget } from "../../../../src/lib/course-builder/commands";
