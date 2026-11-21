import { levelLabels } from "@/components/course/format";
import { cn } from "@/lib/utils";
import { LockIcon } from "./icons";

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function TierBadge({ tier, className }: { tier: "free" | "pro"; className?: string }) {
  return tier === "pro" ? (
    <span className={cn(pill, "bg-iris/15 text-iris-soft ring-1 ring-iris/40", className)}>Pro</span>
  ) : (
    <span className={cn(pill, "bg-success/10 text-success ring-1 ring-success/30", className)}>Free</span>
  );
}

export function LevelBadge({ level }: { level: keyof typeof levelLabels }) {
  return <span className={cn(pill, "bg-surface-3 text-muted ring-1 ring-line")}>{levelLabels[level]}</span>;
}

export function PreviewBadge() {
  return <span className={cn(pill, "bg-accent/15 text-accent-soft ring-1 ring-accent/40")}>Free preview</span>;
}

export function LockedMark() {
  return (
    <span className="inline-flex text-subtle" role="img" aria-label="Locked">
      <LockIcon />
    </span>
  );
}
