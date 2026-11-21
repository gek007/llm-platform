import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KnowledgeGraphBackdrop } from "./knowledge-graph-backdrop";

const motionPref = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionPref.reduce,
}));

function createMockContext2D() {
  const gradient = { addColorStop: vi.fn() };
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
  };
}

let mockCtx: ReturnType<typeof createMockContext2D>;
let rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }>;
let nextRafId: number;

beforeEach(() => {
  mockCtx = createMockContext2D();
  rafCallbacks = [];
  nextRafId = 1;

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => mockCtx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextRafId++;
    rafCallbacks.push({ id, cb });
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

describe("KnowledgeGraphBackdrop", () => {
  test("with reduced motion draws one static frame and schedules no RAF loop", () => {
    motionPref.reduce = true;
    render(<KnowledgeGraphBackdrop />);

    const backdrop = screen.getByTestId("knowledge-graph-backdrop");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("data-reduced", "true");
    expect(backdrop.className).toContain("pointer-events-none");
    expect(backdrop.querySelector("canvas")).not.toBeNull();

    expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);
    expect(mockCtx.bezierCurveTo).toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  test("with motion enabled runs RAF, pauses while hidden, and cancels on unmount", () => {
    motionPref.reduce = false;
    const { unmount } = render(<KnowledgeGraphBackdrop />);

    const backdrop = screen.getByTestId("knowledge-graph-backdrop");
    expect(backdrop).toHaveAttribute("data-reduced", "false");
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(rafCallbacks).toHaveLength(1);

    // Advance one animation frame.
    const firstFrame = rafCallbacks.shift();
    firstFrame?.cb(16);
    expect(mockCtx.clearRect.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rafCallbacks).toHaveLength(1);

    // Hiding the document pauses the loop; showing it resumes.
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(rafCallbacks).toHaveLength(0);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rafCallbacks).toHaveLength(1);

    // Unmounting cancels the pending animation frame.
    unmount();
    expect(rafCallbacks).toHaveLength(0);
  });
});
