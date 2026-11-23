"use client";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const linkClass = "rounded-md px-3 py-1.5 text-sm transition-colors hover:text-fg";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(linkClass, active ? "text-fg" : "text-muted")}
    >
      {label}
    </Link>
  );
}

function AccountNav() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  return (
    <>
      <NavLink href="/dashboard" label="My Learning" />
      {isAdmin ? <NavLink href="/admin" label="Admin" /> : null}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="inline-block size-6 rounded-md bg-linear-to-br from-accent-soft via-accent to-iris shadow-glow"
          />
          {siteConfig.name}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Suspense
            fallback={siteConfig.nav.map((item) => (
              <Link key={item.href} href={item.href} className={cn(linkClass, "text-muted")}>
                {item.label}
              </Link>
            ))}
          >
            {siteConfig.nav.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
            <Show when="signed-in">
              <AccountNav />
            </Show>
          </Suspense>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton>
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
            <SignUpButton>
              <Button>Get started</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
