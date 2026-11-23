import { ChapterTestView } from "@/components/chapter/chapter-test";

export default async function ChapterTestPage({
  params,
}: PageProps<"/courses/[slug]/chapters/[chapterSlug]/test">) {
  const { slug, chapterSlug } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <ChapterTestView courseSlug={slug} chapterSlug={chapterSlug} />
    </main>
  );
}
