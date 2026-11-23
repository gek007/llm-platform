import { youtubeIdFromUrl } from "../../../../src/components/markdown/embeds";
import { fetchJson, type FetchDeps } from "./safe-fetch";

export type YouTubeInfo = { videoId: string; title: string; channel: string };

/**
 * Title and channel of a YouTube video via oEmbed. YouTube is embed-only: the agent never sees a
 * video's content or transcript. The oEmbed request is built from the parsed video ID (never the
 * raw input URL) and goes through the safe fetch. Throws `Error` with a model-readable message.
 */
export async function youtubeInfo(url: string, deps: FetchDeps = {}): Promise<YouTubeInfo> {
  const videoId = youtubeIdFromUrl(url);
  if (!videoId) throw new Error(`Not a YouTube video URL: ${url}`);
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const data = (await fetchJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    deps,
  )) as { title?: unknown; author_name?: unknown } | null;
  const title = typeof data?.title === "string" ? data.title.trim().slice(0, 300) : "";
  const channel = typeof data?.author_name === "string" ? data.author_name.trim().slice(0, 300) : "";
  if (!title) throw new Error(`YouTube returned no title for video ${videoId}`);
  return { videoId, title, channel };
}
