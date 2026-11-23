import type { YoutubeEmbed as Embed } from "./embeds";

/** Privacy-enhanced YouTube embed (youtube-nocookie.com). */
export function YoutubeEmbed({ embed }: { embed: Embed }) {
  const query = embed.start ? `?start=${embed.start}` : "";
  return (
    <div className="not-prose my-6 aspect-video w-full overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-soft">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${embed.videoId}${query}`}
        title={embed.title}
        loading="lazy"
        className="h-full w-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
