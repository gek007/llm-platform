import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { deckSchema, requiredVisuals } from "../../../convex/lib/deck";
import { commandMessage } from "../../../src/lib/course-builder/commands";
import type config from "./evals.config";

// The deck pipeline alone, end to end with the real model, against the fake engine: a `write`
// command for "How DNS works", whose lessons and test are already saved (evals/lib/dns-course.ts).
// Costs real tokens (an Opus root turn and one Opus deck writer); run on demand with
// `npm run eval:course-builder -- dns-deck`. With EVAL_DECK_OUT=<file> the saved deck is also
// written there as `{ chapterId, title, slides }`: that is how the sample deck in
// src/components/chapter/samples/ was generated.
export default defineEval<typeof config>({
  description: "A resumed write where only the slide deck is missing: no chapter writer; the deck is generated as JSON, validated and saved.",
  async test(t) {
    const engine = t.context.deckEngine;
    const before = engine.job.chapters[0]!.lessons.map((l) => l.body);
    const turn = await t.send(commandMessage({ action: "write", jobId: engine.job.jobId }));
    t.succeeded();
    t.toolOrder(["get_job", "write_course", "finish_job"]);

    const chapter = engine.job.chapters[0]!;
    const deck = chapter.deck ?? [];
    const ops = engine.calls.map((c) => (c.ok ? c.op : `${c.op} (refused: ${c.error})`));
    t.log(`reply: ${turn.reply ?? ""}`);
    t.log(`engine calls: ${ops.join(", ")}`);
    t.log(`events: ${engine.events.map((e) => `[${e.kind}] ${e.message}`).join(" | ")}`);
    t.log(`layouts: ${deck.map((s) => s.layout).join(", ")}`);
    t.log(`visuals: ${deck.map((s) => s.visual?.type ?? "-").join(", ")}`);

    // Only the deck was written: the lessons and the test are untouched.
    t.check(engine.calls.filter((c) => c.op === "saveSubchapter" || c.op === "saveTest").length, equals(0));
    t.check(
      chapter.lessons.map((l) => l.body),
      equals(before),
    );
    t.check(engine.calls.filter((c) => c.op === "saveDeck" && c.ok).length, satisfies((n: number) => n >= 1, "the deck was saved"));
    t.check(engine.job.status, equals("ready"));

    // What was stored is a deck by the schema: 8-15 slides, title first, summary last, unique ids.
    const stored = { chapterId: "how-dns-works/chapter-1", title: chapter.deckTitle ?? chapter.title, slides: deck };
    const parsed = deckSchema.safeParse(stored);
    t.check(parsed.success, equals(true));
    // 40% of slides carry a visual, less one for every diagram that fell back to bullets.
    const fellBack = engine.events.filter((e) => /was replaced with bullets/.test(e.message)).length;
    t.check(
      deck.filter((s) => s.visual).length,
      satisfies((n: number) => n >= requiredVisuals(deck.length) - fellBack, "at least 40% of slides carry a visual"),
    );
    t.check(
      deck.filter((s) => s.visual?.type === "mermaid").length + fellBack,
      satisfies((n: number) => n >= 1, "a chapter about a lookup process has a Mermaid diagram"),
    );
    t.check(JSON.stringify(deck).includes("<"), equals(false)); // no markup anywhere in the JSON

    const out = process.env.EVAL_DECK_OUT;
    if (out && parsed.success) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(parsed.data, null, 2)}\n`);
      t.log(`deck written to ${out}`);
    }
  },
});
