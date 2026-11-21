import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminOverlay } from "@/components/admin/admin-overlay";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/** Server-side admin check (the proxy only gates signed-out users). Non-admins get a 404. */
async function AdminGate({ children }: { children: ReactNode }) {
  const { userId, sessionClaims } = await auth.protect();
  const role = (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role;
  if (!userId || role !== "admin") notFound();
  return (
    <>
      {children}
      <AdminOverlay />
    </>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <Suspense fallback={<p className="text-muted">Loading admin...</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}
