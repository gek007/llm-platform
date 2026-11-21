import Link from "next/link";
import { CourseForm } from "@/components/admin/course-form";

export default function NewCoursePage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="text-sm text-muted hover:text-fg">
        &larr; All courses
      </Link>
      <h1 className="font-display text-3xl">New course</h1>
      <CourseForm />
    </div>
  );
}
