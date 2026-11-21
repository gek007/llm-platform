import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { LessonVideo } from "./lesson-video";

const getTokens = vi.fn();
vi.mock("convex/react", () => ({ useAction: () => getTokens }));
vi.mock("@mux/mux-player-react/lazy", () => ({
  default: (props: { playbackId: string; tokens: Record<string, string>; onError: () => void }) => (
    <button data-testid="player" data-playback={props.playbackId} data-token={props.tokens.playback} onClick={props.onError} />
  ),
}));

const lessonId = "l1" as Id<"lessons">;
const minted = { playbackId: "pb1", playback: "tv", thumbnail: "tt", storyboard: "ts", expiresAt: Date.now() + 7_200_000 };

beforeEach(() => {
  getTokens.mockReset();
});

describe("LessonVideo", () => {
  test("shows loading, then the player with signed tokens", async () => {
    getTokens.mockResolvedValue(minted);
    render(<LessonVideo lessonId={lessonId} title="T" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading video");
    const player = await screen.findByTestId("player");
    expect(player).toHaveAttribute("data-playback", "pb1");
    expect(player).toHaveAttribute("data-token", "tv");
    expect(getTokens).toHaveBeenCalledWith({ lessonId });
  });

  test("shows an error state when minting fails", async () => {
    getTokens.mockRejectedValue(new Error("boom"));
    render(<LessonVideo lessonId={lessonId} title="T" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  });

  test("shows unavailable when no token is issued", async () => {
    getTokens.mockResolvedValue(null);
    render(<LessonVideo lessonId={lessonId} title="T" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("not available"));
    expect(screen.queryByTestId("player")).toBeNull();
  });
});
