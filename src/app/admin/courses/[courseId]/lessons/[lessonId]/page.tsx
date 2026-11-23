import { Suspense } from "react";
import { LessonEditor } from "@/components/admin/lesson-editor";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

type Params = PageProps<"/admin/courses/[courseId]/lessons/[lessonId]">["params"];

async function EditorContent({ params }: { params: Params }) {
  const { lessonId } = await params;
  return <LessonEditor lessonId={lessonId as Id<"lessons">} />;
}

/** `params` is read inside Suspense so the App Shell holds no URL data (required by partialPrefetching). */
export default function LessonPage({ params }: PageProps<"/admin/courses/[courseId]/lessons/[lessonId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading lesson...</p>}>
      <EditorContent params={params} />
    </Suspense>
  );
}
