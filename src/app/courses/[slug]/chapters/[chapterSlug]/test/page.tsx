import { Suspense } from "react";
import { ChapterTestView } from "@/components/chapter/chapter-test";

async function ChapterTestContent({ params }: PageProps<"/courses/[slug]/chapters/[chapterSlug]/test">) {
  const { slug, chapterSlug } = await params;
  return <ChapterTestView courseSlug={slug} chapterSlug={chapterSlug} />;
}

export default function ChapterTestPage(props: PageProps<"/courses/[slug]/chapters/[chapterSlug]/test">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Loading test" className="h-48 animate-pulse rounded-xl border border-line bg-surface" />
        }
      >
        <ChapterTestContent {...props} />
      </Suspense>
    </main>
  );
}
