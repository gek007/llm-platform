import { Button } from "@/components/ui/button";
import { StatusMessage } from "./admin-fields";

export function SyncNotices({ paused, conflict, onDiscard }: { paused?: boolean; conflict: boolean; onDiscard: () => void }) {
  return (
    <>
      {paused ? <StatusMessage kind="error">Regenerating — editing is paused</StatusMessage> : null}
      {conflict ? (
        <div className="flex flex-wrap items-center gap-3">
          <StatusMessage kind="error">This content changed on the server while you were editing. Your edits are kept; saving would overwrite the new version.</StatusMessage>
          <Button type="button" variant="secondary" onClick={onDiscard}>
            Discard my changes and reload
          </Button>
        </div>
      ) : null}
    </>
  );
}
