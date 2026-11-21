import type { Metadata } from "next";
import Link from "next/link";
import { LearnlyChat } from "@/components/learnly/learnly-chat";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: `AI tutor — ${siteConfig.name}`,
  description:
    `Chat with Learnly, the AI tutor for ${siteConfig.name} Pro members.`,
};

export default function LearnlyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <div>
          <Button variant="ghost" render={<Link href="/" />} className="-ml-3.5">
            Back to {siteConfig.name}
          </Button>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Learnly</h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Your AI learning assistant for discovering courses, reviewing lesson
          syllabi, and planning study time.
        </p>
      </header>

      <LearnlyChat />
    </main>
  );
}
