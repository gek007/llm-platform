import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSkeleton } from "@/components/course/course-catalog";
import { DashboardCourses } from "@/components/course/dashboard-courses";

export const metadata: Metadata = { title: "My Learning" };

async function ProtectedCourses() {
  await auth.protect();
  return <DashboardCourses />;
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold">My Learning</h1>
        <p className="mt-3 text-muted">Pick up where you left off.</p>
      </header>
      <Suspense fallback={<CatalogSkeleton />}>
        <ProtectedCourses />
      </Suspense>
    </main>
  );
}
