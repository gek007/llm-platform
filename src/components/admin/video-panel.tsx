"use client";

import MuxPlayer from "@mux/mux-player-react";
import MuxUploader from "@mux/mux-uploader-react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { confirm } from "@ui-sdk/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "./admin-utils";
import { StatusMessage } from "./admin-fields";

export const POLL_INTERVAL_MS = 4000;

const statusText: Record<string, string> = {
  waiting: "Waiting for the upload to finish",
  processing: "Mux is processing the video",
  ready: "Ready",
  errored: "Mux could not process the video",
};

/** Mux direct upload, status (polled while waiting/processing), preview player and removal. */
export function VideoPanel({ lesson }: { lesson: Doc<"lessons"> }) {
  const createUpload = useAction(api.mux.createUpload);
  const syncVideo = useAction(api.mux.syncLessonVideo);
  const removeVideo = useAction(api.mux.removeVideo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const status = lesson.videoStatus;
  const pending = status === "waiting" || status === "processing";
  const syncing = useRef(false);

  async function sync() {
    if (syncing.current) return;
    syncing.current = true;
    try {
      await syncVideo({ lessonId: lesson._id });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      syncing.current = false;
    }
  }

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(sync, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, lesson._id]);

  async function onRemove() {
    const yes = await confirm({
      title: "Remove this video?",
      description: "The video is deleted from Mux and the lesson will have no video.",
      confirmLabel: "Remove",
    });
    if (!yes) return;
    setBusy(true);
    try {
      await removeVideo({ lessonId: lesson._id });
      setError(null);
      setReplacing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const showUploader = !status || status === "errored" || status === "waiting" || replacing;

  return (
    <section aria-labelledby="video-heading" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="video-heading" className="text-lg font-semibold">
          Video
        </h2>
        <p data-testid="video-status" className="text-sm text-muted">
          {status ? statusText[status] : "No video"}
        </p>
      </div>

      {status === "ready" && lesson.muxPlaybackId && !replacing ? (
        <div className="overflow-hidden rounded-lg border border-line">
          <MuxPlayer playbackId={lesson.muxPlaybackId} accentColor="#ff8a3d" metadata={{ video_title: lesson.title }} />
        </div>
      ) : null}

      {showUploader ? (
        <MuxUploader
          endpoint={async () => {
            const { url } = await createUpload({ lessonId: lesson._id });
            return url;
          }}
          onSuccess={() => {
            setReplacing(false);
            void sync();
          }}
          onUploadError={() => setError("The upload failed. Try again.")}
          style={{ ["--progress-bar-fill-color"]: "#ff8a3d" } as React.CSSProperties}
        />
      ) : null}

      {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}

      <div className="flex flex-wrap gap-2">
        {pending ? (
          <Button type="button" variant="secondary" onClick={() => void sync()}>
            Check status
          </Button>
        ) : null}
        {status === "ready" && !replacing ? (
          <Button type="button" variant="secondary" onClick={() => setReplacing(true)}>
            Replace video
          </Button>
        ) : null}
        {replacing ? (
          <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>
            Cancel replace
          </Button>
        ) : null}
        {status ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void onRemove()}>
            Remove video
          </Button>
        ) : null}
      </div>
    </section>
  );
}
