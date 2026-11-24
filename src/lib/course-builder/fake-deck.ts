import type { DeckSlide } from "../../../convex/lib/deck";

/**
 * The canned deck the fake engine saves for every chapter (`COURSE_ENGINE_MODE=fake`): one slide of
 * each layout and one visual of each type, so an offline demo shows everything the viewer renders.
 * It must pass the real deck schema and the generation rule (40% of slides carry a visual);
 * fake-deck.test.ts checks both, and that every diagram parses.
 */
export function fakeDeck(title: string): DeckSlide[] {
  const note = (s: string) => `${s} Speak to this slide for about a minute.`;
  return [
    {
      id: "s1",
      layout: "title",
      title,
      bullets: ["A guided tour"],
      notes: note("Welcome the learners."),
    },
    {
      id: "s2",
      layout: "bullets",
      title: "What you will learn",
      bullets: ["The key idea", "How the parts fit together", "How to check your work"],
      notes: note("Preview the chapter."),
    },
    {
      id: "s3",
      layout: "bullets+visual",
      title: "How the parts fit together",
      bullets: ["Start from the question", "Work through each step", "Check the result"],
      visual: {
        type: "mermaid",
        code: [
          "flowchart LR",
          "  Q[Question] --> P[Plan]",
          "  P --> S[Steps]",
          "  S --> C{Correct?}",
          "  C -- yes --> D[Done]",
          "  C -- no --> P",
        ].join("\n"),
        caption: "The loop every worked example follows",
      },
      notes: note("Trace the loop once with a small example."),
    },
    {
      id: "s4",
      layout: "two-column",
      title: "Theory and practice",
      left: ["Concepts", "Vocabulary"],
      right: ["Examples", "Exercises"],
      notes: note("Contrast the two sides."),
    },
    {
      id: "s5",
      layout: "visual-full",
      title: "Where the time goes",
      visual: {
        type: "chart",
        chartType: "bar",
        data: [
          { label: "Reading", value: 20 },
          { label: "Examples", value: 35 },
          { label: "Practice", value: 45 },
        ],
        caption: "Share of study time per activity (%)",
      },
      notes: note("Point out that practice takes the largest share."),
    },
    {
      id: "s6",
      layout: "code",
      title: "A worked example",
      code: {
        language: "python",
        content: ["def check(result, expected):", '    """Verify one step before moving on."""', "    return result == expected"].join("\n"),
      },
      bullets: ["Verify each step before the next"],
      notes: note("Walk through the example slowly."),
    },
    {
      id: "s7",
      layout: "visual-full",
      title: "Do and avoid",
      visual: {
        type: "table",
        headers: ["Do", "Avoid"],
        rows: [
          ["Test small pieces", "Guess without checking"],
          ["Write things down", "Rush the setup"],
          ["Change one thing at a time", "Change many things at once"],
        ],
      },
      notes: note("Summarise good habits."),
    },
    {
      id: "s8",
      layout: "quote",
      title: "Keep it simple",
      quote: "Make it work, then make it better.",
      attribution: "A common engineering saying",
      notes: note("Use the quote to set expectations."),
    },
    {
      id: "s9",
      layout: "bullets+visual",
      title: "Common mistakes",
      bullets: ["Skipping the basics", "Changing many things at once"],
      visual: {
        type: "image_prompt",
        prompt: "A learner at a desk crossing items off a short checklist, flat illustration",
        alt: "A learner working through a checklist",
      },
      notes: note("Ask learners which they have seen."),
    },
    {
      id: "s10",
      layout: "summary",
      title: "Key takeaways",
      bullets: ["Start small", "Verify each step", "Practice regularly"],
      notes: note("Recap and point to the chapter test."),
    },
  ];
}
