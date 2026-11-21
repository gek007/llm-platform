import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { siteConfig } from "@/config/site";

const stack = [
  {
    value: "auth",
    label: "Authentication",
    service: "Clerk",
    description: "Sign-in, user accounts, organizations and roles.",
  },
  {
    value: "backend",
    label: "Backend",
    service: "Convex",
    description:
      "Database, server functions and realtime updates for courses and progress.",
  },
  {
    value: "hosting",
    label: "Hosting",
    service: "Hostinger",
    description: "Web hosting, domain and DNS.",
  },
  {
    value: "interface",
    label: "Interface",
    service: "UI SDK",
    description: "Accessible components with keyboard, focus and ARIA built in.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-24">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">{siteConfig.name}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Courses, lessons and learner progress. The platform is being set up.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Platform stack</h2>
        <Accordion aria-label="Platform stack">
          {stack.map((item) => (
            <AccordionItem key={item.value} value={item.value}>
              <AccordionHeader render={<h3 />}>
                <AccordionTrigger>{item.label}</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <p>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {item.service}
                  </span>{" "}
                  — {item.description}
                </p>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </main>
  );
}
