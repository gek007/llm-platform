import { expect, test, type Page } from "@playwright/test";

// The deck viewer in a real browser, on the public sample deck (a deck the course engine
// generated, src/components/chapter/samples/how-dns-works.deck.json): what jsdom cannot check,
// that Mermaid and the charts really draw and that nothing leaves the slide's frame.

const deck = (page: Page) => page.getByRole("region", { name: "How a DNS lookup works" });
const counter = (page: Page) => deck(page).getByText(/^\d+ \/ \d+$/);

/** Boxes drawn outside the slide frame, or cut off inside it (content taller/wider than its scaled box). */
async function spill(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector(".slide-stage > div")!;
    const bounds = frame.getBoundingClientRect();
    const outside: string[] = [];
    for (const el of frame.querySelectorAll("*")) {
      if (el.closest(".sr-only") || el.closest(".recharts-tooltip-wrapper")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const over = Math.max(bounds.left - box.left, box.right - bounds.right, bounds.top - box.top, box.bottom - bounds.bottom);
      if (over > 1.5) outside.push(`${el.tagName.toLowerCase()} by ${Math.round(over)}px`);
    }
    return outside;
  });
}

async function goToSlide(page: Page, n: number) {
  await deck(page).focus();
  await page.keyboard.press("Home");
  for (let i = 1; i < n; i++) await page.keyboard.press("ArrowRight");
  await expect(counter(page)).toHaveText(`${n} / 14`);
  // Lazy visuals: wait until no loading placeholder is left on the slide.
  await expect(deck(page).locator(".slide-stage").getByRole("status", { name: /^Loading/ })).toHaveCount(0);
}

test.describe("slide deck viewer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/samples/how-dns-works");
    await expect(deck(page).getByRole("heading", { name: "How a DNS lookup works" })).toBeVisible();
  });

  test("keyboard: arrows and Space move, Escape opens the overview, a pick goes to that slide", async ({ page }) => {
    await expect(counter(page)).toHaveText("1 / 14");
    await deck(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(counter(page)).toHaveText("2 / 14");
    await page.keyboard.press("Space");
    await expect(counter(page)).toHaveText("3 / 14");
    await page.keyboard.press("ArrowLeft");
    await expect(counter(page)).toHaveText("2 / 14");

    await page.keyboard.press("Escape");
    const overview = deck(page).getByRole("list", { name: "All slides" });
    await expect(overview.getByRole("listitem")).toHaveCount(14);
    await overview.getByRole("button", { name: "Slide 8: Watch a lookup with dig" }).click();
    await expect(overview).toHaveCount(0);
    await expect(counter(page)).toHaveText("8 / 14");
    await expect(deck(page).getByText("dig www.example.com A +trace")).toBeVisible();
  });

  test("the progress bar and speaker notes follow the slide", async ({ page }) => {
    const bar = deck(page).getByRole("progressbar", { name: "Deck progress" });
    await deck(page).getByRole("button", { name: "Speaker notes" }).click();
    await expect(deck(page).getByRole("complementary", { name: "Notes" })).toContainText("we follow one domain name");
    await deck(page).focus();
    await page.keyboard.press("End");
    await expect(counter(page)).toHaveText("14 / 14");
    await expect(bar).toHaveAttribute("aria-valuenow", "100");
    await expect(deck(page).getByRole("complementary", { name: "Notes" })).toContainText("recap the chapter");
    await expect(deck(page).getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("Mermaid diagrams and charts are drawn, in dark and in light", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("[SlideDeck]")) warnings.push(message.text());
    });

    await goToSlide(page, 5);
    const diagram = deck(page).getByRole("img", { name: "Nothing is cached yet, so the resolver asks three servers" });
    await expect(diagram).toBeVisible();
    await expect(diagram.getByText("Recursive resolver").first()).toBeVisible();
    await expect(deck(page)).toHaveAttribute("data-theme", "dark");
    const darkFill = await diagram.locator("rect.actor").first().evaluate((el) => getComputedStyle(el).fill);

    await deck(page).getByRole("button", { name: "Light slides" }).click();
    await expect(deck(page)).toHaveAttribute("data-theme", "light");
    await expect(diagram).toBeVisible();
    // The diagram is redrawn with the light theme's colours, not left dark on a light slide.
    await expect.poll(() => diagram.locator("rect.actor").first().evaluate((el) => getComputedStyle(el).fill)).not.toBe(darkFill);

    await goToSlide(page, 13);
    await expect(deck(page).locator(".recharts-bar-rectangle")).toHaveCount(2);
    // The same numbers as a table for screen readers.
    await expect(deck(page).getByRole("table", { name: /^Bar chart: Example timings/ })).toContainText("Uncached lookup");
    expect(warnings).toEqual([]);
  });

  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    test(`no slide draws outside its frame (${viewport.name})`, async ({ page }) => {
      const clipped: string[] = [];
      page.on("console", (message) => {
        if (message.text().includes("is clipped")) clipped.push(message.text());
      });
      await page.setViewportSize(viewport);
      for (let n = 1; n <= 14; n++) {
        await goToSlide(page, n);
        // Auto-scaling applies a frame after the slide mounts: check the settled slide.
        await expect.poll(() => spill(page), { message: `slide ${n}` }).toEqual([]);
      }
      // Nothing in this deck is long enough to be cut off: auto-scaling was enough everywhere.
      expect(clipped).toEqual([]);
    });
  }

  test("fullscreen: the slide and its controls fit the screen, keys still work, and the button leaves it", async ({ page }) => {
    await deck(page).getByRole("button", { name: "Fullscreen" }).click();
    const exit = deck(page).getByRole("button", { name: "Exit fullscreen" });
    await expect(exit).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement?.classList.contains("slide-deck"))).toBe(true);
    const viewport = page.viewportSize()!;
    const frame = (await deck(page).locator(".slide-stage > div").boundingBox())!;
    const controls = (await exit.boundingBox())!;
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width);
    expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height);
    // The slide grows with the screen: it is wider than the inline deck's column.
    expect(frame.width).toBeGreaterThan(900);
    await expect.poll(() => spill(page)).toEqual([]);
    await page.keyboard.press("ArrowRight");
    await expect(counter(page)).toHaveText("2 / 14");
    await exit.click();
    await expect(deck(page).getByRole("button", { name: "Fullscreen", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test("Listen reads each slide's speaker notes and moves on when they end", async ({ page }) => {
    // A stand-in for the browser's speech engine (headless Chromium has no voices): it records
    // what it is asked to say and reports each sentence finished a moment later.
    await page.addInitScript(() => {
      const spoken: string[] = [];
      const voice = { lang: "en-US", name: "Test voice", default: true, localService: true, voiceURI: "test" };
      class Utterance {
        lang = "";
        voice: unknown = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public text: string) {}
      }
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          getVoices: () => [voice],
          addEventListener() {},
          removeEventListener() {},
          cancel() {},
          resume() {},
          speak(utterance: Utterance) {
            spoken.push(utterance.text);
            setTimeout(() => utterance.onend?.(), 40);
          },
        },
      });
      Object.assign(window, { SpeechSynthesisUtterance: Utterance, __spoken: spoken });
    });
    await page.reload();
    await expect(deck(page).getByRole("heading", { name: "How a DNS lookup works" })).toBeVisible();

    await deck(page).getByRole("button", { name: "Listen" }).click();
    // The notes of slide 1 end, the deck advances by itself and keeps reading.
    await expect(counter(page)).toHaveText("3 / 14");
    await deck(page).getByRole("button", { name: "Listen" }).click();
    await expect(deck(page).getByRole("button", { name: "Listen" })).toHaveAttribute("aria-pressed", "false");
    await expect(deck(page).locator("[data-slot='narration-caption']")).toHaveCount(0);

    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken[0]).toBe("In this chapter we follow one domain name from your browser all the way to an IP address.");
    // Slide 2's notes were read after slide 1's, in order.
    expect(spoken.join(" ")).toContain("This short line captures the whole idea of DNS.");
  });

  test("a phone gets the 3:4 frame and stacked columns", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goToSlide(page, 4);
    const frame = deck(page).locator(".slide-stage > div");
    const box = (await frame.boundingBox())!;
    expect(box.height / box.width).toBeCloseTo(4 / 3, 1);
    const bullets = (await deck(page).getByRole("list").first().boundingBox())!;
    const table = (await deck(page).getByRole("table").boundingBox())!;
    expect(table.y).toBeGreaterThan(bullets.y + bullets.height - 1);
  });
});
