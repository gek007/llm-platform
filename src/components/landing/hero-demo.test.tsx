import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HeroDemo } from "./hero-demo";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionPref.reduce,
}));

afterEach(() => vi.useRealTimers());

describe("HeroDemo", () => {
  test("with reduced motion it renders the finished state, untyped and static", () => {
    motionPref.reduce = true;
    render(<HeroDemo />);
    const demo = screen.getByTestId("hero-demo");
    expect(demo).toHaveAttribute("data-reduced", "true");
    expect(demo).toHaveAttribute("aria-hidden", "true");
    expect(demo).toHaveTextContent("const lesson = await getLesson(slug);");
    expect(demo).toHaveTextContent("75%");
    expect(screen.getByTestId("tutor-bubble")).toHaveTextContent("AI tutor");
  });

  test("with motion it starts at the beginning and types the code in", async () => {
    motionPref.reduce = false;
    vi.useFakeTimers();
    render(<HeroDemo />);
    const demo = screen.getByTestId("hero-demo");
    expect(demo).toHaveAttribute("data-reduced", "false");
    expect(demo).toHaveTextContent("45%");
    expect(demo).not.toHaveTextContent("const lesson");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(demo).toHaveTextContent("const lesson");
    expect(demo).not.toHaveTextContent("return <Player id={lesson.video} />;");
  });
});
