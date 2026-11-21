"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

/** `useQuery` that waits for Convex to have validated the Clerk token (admin queries throw otherwise). */
export function useAdminQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"],
): Query["_returnType"] | undefined {
  const { isAuthenticated } = useConvexAuth();
  const maybeArgs = (isAuthenticated ? args : "skip") as Query["_args"];
  return useQuery(query, maybeArgs);
}
