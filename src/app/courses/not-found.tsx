import Link from "next/link";

export default function CoursesNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">Course not found</h1>
      <p className="mt-2 text-muted">That course or lesson doesn&apos;t exist, or isn&apos;t published yet.</p>
      <Link
        href="/courses"
        className="mt-6 inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-soft"
      >
        Back to courses
      </Link>
    </main>
  );
}
