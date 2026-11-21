import { percent } from "@/components/course/format";

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const value = percent(done, total);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>
          {done} of {total} lessons
        </span>
        <span>{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
