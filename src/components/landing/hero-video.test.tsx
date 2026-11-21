import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HeroVideo } from "./hero-video";

vi.mock("@mux/mux-player-react/lazy", () => ({
  default: (props: {
    playbackId: string;
    streamType: string;
    autoPlay?: boolean;
    accentColor?: string;
    title?: string;
  }) => (
    <div
      data-testid="mock-mux-player"
      data-playback-id={props.playbackId}
      data-stream-type={props.streamType}
      data-autoplay={props.autoPlay ? "true" : "false"}
      data-accent={props.accentColor}
      data-title={props.title}
    />
  ),
}));

describe("HeroVideo", () => {
  test("shows a poster trigger first and mounts the Mux player on click", async () => {
    const user = userEvent.setup();
    render(
      <HeroVideo
        playbackId="public-pb-123"
        title="Why types? preview"
        durationLabel="0:25"
        phase={0}
        phaseDurationMs={2200}
        reduced={false}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Play Why types? preview" });
    expect(trigger).toBeInTheDocument();
    expect(trigger.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.mux.com/public-pb-123/thumbnail.webp?width=640&time=2",
    );
    expect(screen.queryByTestId("mock-mux-player")).toBeNull();

    await user.click(trigger);

    const player = screen.getByTestId("mock-mux-player");
    expect(player).toHaveAttribute("data-playback-id", "public-pb-123");
    expect(player).toHaveAttribute("data-stream-type", "on-demand");
    expect(player).toHaveAttribute("data-autoplay", "true");
    expect(player).toHaveAttribute("data-accent", "#ff8a3d");
    expect(screen.queryByTestId("hero-video-trigger")).toBeNull();
  });
});
