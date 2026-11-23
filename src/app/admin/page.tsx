import { CoursesTable } from "@/components/admin/courses-table";
import { JobsList } from "@/components/generate/jobs-list";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-10">
      <CoursesTable />
      <JobsList />
    </div>
  );
}
