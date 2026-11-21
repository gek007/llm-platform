import { CourseEditor } from "@/components/admin/course-editor";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CourseEditor courseId={courseId as Id<"courses">} />;
}
