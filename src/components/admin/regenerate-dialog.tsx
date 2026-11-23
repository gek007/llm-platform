"use client";

import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { describeFailure, postAction } from "@/components/generate/api";
import { StatusMessage, Textarea } from "./admin-fields";

export const INSTRUCTION_MAX = 500;

export type RegenerateTarget = {
  kind: "subchapter" | "deck" | "test" | "chapter";
  chapterOrder: number;
  subchapterOrder?: number;
};

export function RegenerateDialog({
  jobId,
  target,
  label,
  disabled,
}: {
  jobId: string;
  target: RegenerateTarget;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const trimmed = instruction.trim();
  const tooLong = instruction.length > INSTRUCTION_MAX;
  const valid = trimmed.length > 0 && !tooLong;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    const result = await postAction("regenerate", { jobId, target, instruction: trimmed });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setInstruction("");
      return;
    }
    // A 409 on regenerate carries a ready-made message (the published-course refusal).
    setError(result.status === 409 && result.error !== "BAD_STATE" ? result.error : describeFailure(result));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" disabled={disabled} aria-label={label} />}>Regenerate</DialogTrigger>
      <DialogBackdrop className="fixed inset-0 bg-black/60" />
      <DialogContent className="fixed top-1/2 left-1/2 flex w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface-1 p-6 text-fg">
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-lg font-semibold">{label}</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Tell the writer what to change. The content is rewritten in place and learners keep their earlier results.
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="regenerate-instruction" className="text-sm font-medium">
            Instruction
          </label>
          <Textarea id="regenerate-instruction" dir="auto" rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <p className={`text-xs ${tooLong ? "text-danger" : "text-subtle"}`}>
            {instruction.length}/{INSTRUCTION_MAX}
          </p>
        </div>
        {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <Button type="button" disabled={!valid || busy} onClick={() => void submit()}>
            Regenerate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
