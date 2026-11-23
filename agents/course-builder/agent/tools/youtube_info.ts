import { defineTool } from "eve/tools";
import { z } from "zod";
import { youtubeInfo } from "../lib/youtube";

export default defineTool({
  description:
    "Get a YouTube video's ID, title and channel (via YouTube oEmbed). YouTube is embed-only: you never get the video's content or transcript, so never describe what a video says.",
  inputSchema: z.object({
    url: z.string().trim().min(1).max(2000).describe("A YouTube video URL (youtube.com/watch, youtu.be, shorts or embed)."),
  }),
  label: { start: ({ url }) => `Look up YouTube video ${url}` },
  async execute({ url }, ctx) {
    try {
      return { ok: true as const, ...(await youtubeInfo(url, { signal: ctx.abortSignal })) };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  },
});
