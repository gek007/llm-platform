import { Suspense } from "react";
import { LessonSkeleton, LessonView } from "@/components/lesson/lesson-view";

async function LessonPageContent({ params }: PageProps<"/courses/[slug]/lessons/[lessonSlug]">) {
  const { slug, lessonSlug } = await params;
  return <LessonView courseSlug={slug} lessonSlug={lessonSlug} />;
}

export default function LessonPage(props: PageProps<"/courses/[slug]/lessons/[lessonSlug]">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<LessonSkeleton />}>
        <LessonPageContent {...props} />
      </Suspense>
    </main>
  );
}
