import { LessonEditor } from "@/components/admin/lesson-editor";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonEditor lessonId={lessonId as Id<"lessons">} />;
}
