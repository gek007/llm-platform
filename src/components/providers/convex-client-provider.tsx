"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Upserts the Convex `users` row once per signed-in user, after Convex has validated the token. */
function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const store = useMutation(api.users.store);
  const storedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user || storedFor.current === user.id) return;
    storedFor.current = user.id;
    store({
      name: user.fullName ?? user.username ?? undefined,
      email: user.primaryEmailAddress?.emailAddress,
      imageUrl: user.imageUrl,
    }).catch(() => {
      storedFor.current = null;
    });
  }, [isAuthenticated, user, store]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <StoreUser />
      {children}
    </ConvexProviderWithClerk>
  );
}
