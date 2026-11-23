"use client";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAdminQuery } from "./use-admin-query";

export function ResultsTable({ courseId }: { courseId: Id<"courses"> }) {
  const results = useAdminQuery(api.tests.resultsForCourse, { courseId });
  if (results === undefined) return <p className="text-muted">Loading results...</p>;
  const { users, tests, cells } = results;
  if (!tests.length || !users.length) return <p className="text-muted">No chapter tests or attempts yet.</p>;

  const cellFor = (userId: string, testId: string) => cells.find((c) => c.userId === userId && c.testId === testId);

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-start text-sm">
        <caption className="sr-only">Best chapter test result per learner</caption>
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 text-start font-medium">
              Learner
            </th>
            {tests.map((t) => (
              <th key={t.testId} scope="col" className="px-4 py-2 text-start font-medium">
                {t.chapterTitle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.userId}>
              <th scope="row" className="px-4 py-2 text-start font-medium">
                {u.name}
                {u.email ? <span className="block text-xs font-normal text-subtle">{u.email}</span> : null}
              </th>
              {tests.map((t) => {
                const cell = cellFor(u.userId, t.testId);
                if (!cell) {
                  return (
                    <td key={t.testId} className="px-4 py-2 text-subtle">
                      Not attempted
                    </td>
                  );
                }
                const attempts = `${cell.attempts} attempt${cell.attempts === 1 ? "" : "s"}`;
                const label = cell.passed
                  ? `${u.name}, ${t.chapterTitle}: passed with ${cell.bestScore}% after ${attempts}`
                  : `${u.name}, ${t.chapterTitle}: not passed, best ${cell.bestScore}% after ${attempts}`;
                return (
                  <td key={t.testId} className="px-4 py-2" aria-label={label}>
                    <span className={cell.passed ? "text-success" : "text-danger"}>
                      {cell.bestScore}% {cell.passed ? "✓" : "✗"}
                    </span>
                    <span className="block text-xs text-subtle">{attempts}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
