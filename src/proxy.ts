import { clerkMiddleware } from "@clerk/nextjs/server";

// Optimistic gate only. Pages, route handlers and Convex functions re-check on their own.
const protectedPath = /^\/(dashboard|admin|learnly)(\/|$)/;

export default clerkMiddleware(async (auth, req) => {
  if (protectedPath.test(req.nextUrl.pathname)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
