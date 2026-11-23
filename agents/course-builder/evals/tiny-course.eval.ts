import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { commandMessage } from "../../../src/lib/course-builder/commands";
import type config from "./evals.config";

// End to end against the fake engine (evals.config.ts): a `write` command for a 1-chapter course.
// Costs real tokens (Opus root + one Opus chapter writer); run on demand with
// `npm run eval:course-builder`. The eval checks what the engine stored, not the agent's prose.
export default defineEval<typeof config>({
  description: "Writes a tiny approved course (1 chapter, 2 subchapters): lessons, deck and test saved, job ready.",
  async test(t) {
    const { engine } = t.context;
    const turn = await t.send(commandMessage({ action: "write", jobId: engine.job.jobId }));
    t.succeeded();
    t.calledTool("get_job");
    t.calledTool("write_course");
    t.calledTool("finish_job");
    t.toolOrder(["get_job", "write_course", "finish_job"]);
    t.notCalledTool("regenerate");

    const chapter = engine.job.chapters[0]!;
    t.log(`reply: ${turn.reply ?? ""}`);
    t.log(`engine calls: ${engine.calls.map((c) => (c.ok ? c.op : `${c.op} (refused: ${c.error})`)).join(", ")}`);
    t.log(`events: ${engine.events.map((e) => `[${e.kind}${e.chapterOrder ? ` ${e.chapterOrder}` : ""}] ${e.message}`).join(" | ")}`);

    t.check(
      chapter.lessons.map((l) => l.body.trim().length > 200),
      equals([true, true]),
    );
    t.check(
      chapter.lessons.every((l) => /```quiz\n/.test(l.body)),
      equals(true),
    );
    t.check(chapter.deck?.length ?? 0, satisfies((n: number) => n >= 6 && n <= 12, "deck has 6-12 slides"));
    t.check(chapter.test?.questions.length ?? 0, satisfies((n: number) => n >= 8 && n <= 10, "test has 8-10 questions"));
    t.check(engine.job.status, equals("ready"));
    t.check(
      engine.events.filter((e) => e.kind === "chapter" && e.chapterOrder === 1).length,
      satisfies((n: number) => n >= 1, "at least one chapter progress event"),
    );
  },
});
