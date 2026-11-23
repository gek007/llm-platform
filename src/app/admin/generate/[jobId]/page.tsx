import { Suspense } from "react";
import { JobLiveView } from "@/components/generate/job-live-view";

async function LiveContent({ params }: PageProps<"/admin/generate/[jobId]">) {
  const { jobId } = await params;
  return <JobLiveView jobId={jobId} />;
}

export default function JobRoute(props: PageProps<"/admin/generate/[jobId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading job...</p>}>
      <LiveContent {...props} />
    </Suspense>
  );
}
