import { siteConfig } from "@/config/site";
import { Reveal } from "./reveal";

export function TutorSection() {
  const tutor = siteConfig.tutor;
  return (
    <section aria-labelledby="tutor" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Your tutor</p>
          <h2 id="tutor" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Taught by {tutor.name}, backed by an AI that never loses your place
          </h2>
          <div className="mt-8 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tutor.photo}
              alt={`Portrait of ${tutor.name}`}
              width={64}
              height={64}
              className="size-16 rounded-full border border-line-strong bg-surface-2 object-cover"
            />
            <div>
              <p className="font-semibold">{tutor.name}</p>
              <p className="text-sm text-muted">{tutor.role}</p>
            </div>
          </div>
          <p className="mt-5 max-w-prose leading-relaxed text-muted">{tutor.bio}</p>
          <ul className="mt-6 flex flex-wrap gap-3 text-sm">
            {tutor.socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line-strong px-3 py-1 text-muted transition-colors hover:border-accent/60 hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="rounded-xl border border-iris/40 bg-surface-2 p-5 shadow-lift">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-iris-soft">
              <span className="size-2 rounded-full bg-iris" /> AI tutor, included with Pro
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <p className="ml-auto max-w-[80%] rounded-lg rounded-br-sm bg-surface-3 px-3 py-2">
                I keep mixing up generics and unions.
              </p>
              <p className="max-w-[88%] rounded-lg rounded-bl-sm border border-iris/30 bg-iris/10 px-3 py-2 text-fg">
                You are on lesson 4 of TypeScript Foundations and finished the quiz on unions. Want a
                two-minute recap, then a generics quiz?
              </p>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {["Recap unions", "Quiz me on generics", "What next?"].map((chip) => (
                <li key={chip} className="rounded-full bg-iris/20 px-3 py-1 text-iris-soft">
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-sm text-muted">
            It knows the page you are on, the lesson you are reading and what you have finished.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
