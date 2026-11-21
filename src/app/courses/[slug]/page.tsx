import { Suspense } from "react";
import { CourseDetail, CourseDetailSkeleton } from "@/components/course/course-detail";

async function CoursePageContent({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  return <CourseDetail slug={slug} />;
}

export default function CoursePage(props: PageProps<"/courses/[slug]">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<CourseDetailSkeleton />}>
        <CoursePageContent {...props} />
      </Suspense>
    </main>
  );
}
