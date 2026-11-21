"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-display text-2xl font-semibold">Couldn&apos;t load your courses</h1>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
