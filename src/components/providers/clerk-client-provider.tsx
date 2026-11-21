"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { clerkAppearance } from "@/lib/clerk-appearance";

/**
 * Renders Clerk's client provider directly. In a Server Component, `ClerkProvider` resolves to an async server
 * wrapper (keyless-mode check). Under Cache Components, the PPR resume of routes with dynamic params
 * (`/courses/[slug]`, ...) then fails with "Expected the resume to render <ReactClerkProvider> ... but instead it
 * rendered <ClerkProvider>", and React falls back to client rendering (error #419). We use neither keyless mode
 * nor the `dynamic` prop, so the client provider is equivalent here.
 */
export function ClerkClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up">
      {children}
    </ClerkProvider>
  );
}
