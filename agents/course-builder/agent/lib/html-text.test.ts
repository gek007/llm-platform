// @vitest-environment node
import { describe, expect, test } from "vitest";
import { htmlTitle, htmlToText } from "./html-text";

describe("htmlToText", () => {
  test("keeps readable text, drops scripts, styles, comments and navigation", () => {
    const html = `<html><head><title>Budget &amp; you</title><style>p{color:red}</style></head>
      <body><nav>Home | About</nav><!-- hidden --><h1>Budgets</h1><p>Track&nbsp;income &#8212; and spending.</p>
      <ul><li>Needs</li><li>Wants</li></ul><script>alert("x")</script><footer>© site</footer></body></html>`;
    const text = htmlToText(html);
    expect(text).toBe("# Budgets\n\nTrack income — and spending.\n\n- Needs\n- Wants");
    expect(htmlTitle(html)).toBe("Budget & you");
  });

  test("prefers <main> when it holds the content", () => {
    const filler = "Content sentence. ".repeat(20);
    expect(htmlToText(`<div>Menu junk</div><main id="content"><p>${filler}</p></main><div>Sidebar</div>`)).toBe(
      filler.trim(),
    );
  });

  test("drops an unclosed script to the end", () => {
    expect(htmlToText("<p>Before</p><script>var a = '<p>never</p>'")).toBe("Before");
  });

  test("stays fast on pathological input (unclosed tags, no '>')", () => {
    const t0 = performance.now();
    htmlToText("<script ".repeat(200_000));
    htmlToText("<a".repeat(500_000));
    htmlToText("<!--".repeat(500_000));
    htmlToText("<main ".repeat(200_000) + "</main".repeat(1000));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
