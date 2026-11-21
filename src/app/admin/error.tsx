"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  const forbidden = error.message.includes("FORBIDDEN");
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-display text-2xl">{forbidden ? "Admins only" : "Something went wrong"}</h1>
      <p className="text-muted">
        {forbidden
          ? "Your account is not an admin. If it should be, set publicMetadata.role to admin in Clerk."
          : "The admin screen failed to load."}
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
