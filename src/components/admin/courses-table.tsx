"use client";

import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useAdminQuery } from "./use-admin-query";

export function CoursesTable() {
  const courses = useAdminQuery(api.admin.listCourses, {});
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Courses</h1>
        <div className="flex gap-2">
          <Button variant="secondary" render={<Link href="/admin/generate" />}>
            Generate with AI
          </Button>
          <Button render={<Link href="/admin/courses/new" />}>New course</Button>
        </div>
      </div>
      {courses === undefined ? (
        <p className="text-muted">Loading courses...</p>
      ) : courses.length === 0 ? (
        <p className="text-muted">No courses yet. Create the first one.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Lessons</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {courses.map((course) => (
                <tr key={course._id}>
                  <td className="px-4 py-3 font-medium text-fg">{course.title}</td>
                  <td className="px-4 py-3 capitalize text-muted">{course.tier}</td>
                  <td className="px-4 py-3 capitalize text-muted">{course.status}</td>
                  <td className="px-4 py-3 text-muted">{course.lessonCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" render={<Link href={`/admin/courses/${course._id}`} />}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
