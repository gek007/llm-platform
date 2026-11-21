import { Reveal } from "./reveal";

const features = [
  {
    title: "Video lessons",
    text: "Crisp, streamed video right in the lesson, with the notes beside it.",
    icon: "M4 3.5v9l8-4.5z",
  },
  {
    title: "Rich markdown and code",
    text: "Syntax-highlighted code with a copy button, tables and diagrams that read well.",
    icon: "M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4",
  },
  {
    title: "Interactive quizzes",
    text: "Check yourself inline and get an explanation, right or wrong.",
    icon: "M3 8.5l3.2 3L13 4.5",
  },
  {
    title: "Progress tracking",
    text: "Mark lessons complete and pick up exactly where you left off.",
    icon: "M2 12l4-4 3 3 5-6",
  },
  {
    title: "Free previews",
    text: "Try a lesson from any Pro course before you decide to upgrade.",
    icon: "M8 3c4 0 6.5 5 6.5 5S12 13 8 13 1.5 8 1.5 8 4 3 8 3zm0 2.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  },
  {
    title: "AI tutor for Pro",
    text: "A tutor that knows your lesson and progress, suggests next steps and quizzes you.",
    icon: "M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5 6.4 9.1 2 7.5l4.4-1.6z",
  },
];

export function FeaturesSection() {
  return (
    <section aria-labelledby="offers" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">What you get</p>
        <h2 id="offers" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Every course, built the same careful way
        </h2>
      </Reveal>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <li key={feature.title} className="bg-surface p-7">
            <Reveal delay={(i % 3) * 0.08}>
              <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-5">
                  <path d={feature.icon} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" fillOpacity="0.15" />
                </svg>
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.text}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
