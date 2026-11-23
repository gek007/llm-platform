import { Suspense } from "react";
import { ChapterPage } from "@/components/chapter/chapter-view";

async function ChapterContent({ params }: PageProps<"/courses/[slug]/chapters/[chapterSlug]">) {
  const { slug, chapterSlug } = await params;
  return <ChapterPage courseSlug={slug} chapterSlug={chapterSlug} />;
}

export default function ChapterRoute(props: PageProps<"/courses/[slug]/chapters/[chapterSlug]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Loading chapter" className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
        }
      >
        <ChapterContent {...props} />
      </Suspense>
    </main>
  );
}
