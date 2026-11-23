import { Suspense } from "react";
import { CourseEditor } from "@/components/admin/course-editor";
import type { Id } from "../../../../../convex/_generated/dataModel";

type Params = PageProps<"/admin/courses/[courseId]">["params"];

async function EditorContent({ params }: { params: Params }) {
  const { courseId } = await params;
  return <CourseEditor courseId={courseId as Id<"courses">} />;
}

/** `params` is read inside Suspense so the App Shell holds no URL data (required by partialPrefetching). */
export default function CoursePage({ params }: PageProps<"/admin/courses/[courseId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading course...</p>}>
      <EditorContent params={params} />
    </Suspense>
  );
}
