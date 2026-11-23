import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LessonMarkdown } from "./lesson-markdown";

const source = [
  "# Title",
  "",
  "Some `inline` text and a [link](https://example.com).",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```ts",
  "const x: number = 1;",
  "```",
  "",
  "```quiz",
  '{ "question": "Q?", "options": ["A", "B"], "answer": 0, "explanation": "Because." }',
  "```",
  "",
  "```quiz",
  "{ not json",
  "```",
].join("\n");

describe("LessonMarkdown", () => {
  test("renders headings, GFM tables and external links", () => {
    render(<LessonMarkdown source={source} />);
    // The page owns the h1, so a markdown "# Title" renders as h2.
    expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("target", "_blank");
  });

  test("renders a highlighted code block with a working copy button", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<LessonMarkdown source={source} />);

    expect(document.querySelector("code.hljs.language-ts .hljs-keyword")).toHaveTextContent("const");
    await user.click(screen.getByRole("button", { name: /Copy ts to clipboard/ }));
    expect(writeText).toHaveBeenCalledWith("const x: number = 1;");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  test("renders quiz blocks interactively and shows an inline error for invalid ones", () => {
    render(<LessonMarkdown source={source} />);
    expect(screen.getByRole("radiogroup", { name: "Q?" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/quiz block is invalid/i);
  });

  test("renders a youtube block as a privacy-enhanced iframe", () => {
    const md = '```youtube\n{"videoId":"dQw4w9WgXcQ","title":"Intro video","start":12}\n```';
    render(<LessonMarkdown source={md} />);
    const frame = screen.getByTitle("Intro video");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=12");
  });

  test("invalid youtube and resource blocks show the same inline alert as quizzes", () => {
    const md = [
      '```youtube\n{"videoId":"bad","title":"T"}\n```',
      "```resource\n{ nope\n```",
    ].join("\n\n");
    render(<LessonMarkdown source={md} />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent(/youtube block is invalid/i);
    expect(alerts[1]).toHaveTextContent(/resource block is invalid/i);
  });

  test("language he renders an RTL container with auto paragraphs and LTR code", () => {
    const md = "שלום עולם\n\n- פריט\n\n```ts\nconst x = 1;\n```";
    const { container } = render(<LessonMarkdown source={md} language="he" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("dir", "rtl");
    expect(root).toHaveAttribute("lang", "he");
    expect(screen.getByText("שלום עולם")).toHaveAttribute("dir", "auto");
    expect(screen.getByText("פריט").closest("li")).toHaveAttribute("dir", "auto");
    expect(container.querySelector("pre")?.closest("[dir]")).toHaveAttribute("dir", "ltr");
  });

  test("without language the container has no direction attributes", () => {
    const { container } = render(<LessonMarkdown source="hi" />);
    expect(container.firstElementChild).not.toHaveAttribute("dir");
  });
});
