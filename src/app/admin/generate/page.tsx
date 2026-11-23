import { GenerateForm } from "@/components/generate/generate-form";

export default function GeneratePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Generate a course</h1>
      <GenerateForm />
    </div>
  );
}
