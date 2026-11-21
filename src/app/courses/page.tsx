import type { Metadata } from "next";
import { CourseCatalog } from "@/components/course/course-catalog";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse every course: free to start, Pro for the deep dives.",
};

export default function CoursesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <header className="mb-10 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold">Courses</h1>
        <p className="mt-3 text-lg text-muted">
          Hands-on lessons with video, code and quick checks. Start free, go Pro for the deep dives.
        </p>
      </header>
      <CourseCatalog />
    </main>
  );
}
