type Source = { title: string; url: string; kind: string };

/** External references a generated lesson was written from. Renders nothing when there are none. */
export function LessonSources({ sources }: { sources: readonly Source[] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="sources-heading" className="mt-10 border-t border-line pt-6">
      <h2 id="sources-heading" className="font-display text-lg font-semibold">
        Sources
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {sources.map((s) => (
          <li key={s.url} dir="auto">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
