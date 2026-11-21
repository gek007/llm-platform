"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { HeroVideo } from "./hero-video";

const CODE = `const lesson = await getLesson(slug);
if (lesson.locked) return <Upgrade />;
return <Player id={lesson.video} />;`;

/** Duration of each phase in ms: video, code, quiz, progress, tutor. */
const PHASES = [2200, 3000, 2400, 2200, 3600];
const LAST = PHASES.length - 1;
const RING = 2 * Math.PI * 26;

function useDemoClock(reduced: boolean) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setPhase((p) => (p >= LAST ? 0 : p + 1)), PHASES[phase]);
    return () => clearTimeout(id);
  }, [phase, reduced]);
  return reduced ? LAST : phase;
}

function useTypewriter(text: string, active: boolean, reduced: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduced) return;
    if (!active) {
      const reset = setTimeout(() => setCount(0), 0);
      return () => clearTimeout(reset);
    }
    const id = setInterval(() => setCount((c) => Math.min(c + 1, text.length)), 24);
    return () => clearInterval(id);
  }, [active, reduced, text]);
  return reduced ? text : text.slice(0, count);
}

const options = ["A mutable copy", "A readonly literal type", "A runtime check"];

/** Animated lesson preview with a playable Mux video clip, code typing in, quiz, progress ring and tutor bubble. */
export function HeroDemo() {
  const reduced = useReducedMotion() ?? false;
  const phase = useDemoClock(reduced);
  const typed = useTypewriter(CODE, phase >= 1, reduced);
  const quizOn = phase >= 2;
  const ringOn = phase >= 3;
  const tutorOn = phase >= 4;
  const dur = reduced ? 0 : 0.5;

  return (
    <div
      data-testid="hero-demo"
      data-reduced={reduced ? "true" : "false"}
      className="relative mx-auto w-full max-w-xl select-none"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 20%, rgb(255 138 61 / 0.35), transparent), radial-gradient(60% 60% at 80% 80%, rgb(143 132 255 / 0.35), transparent)",
        }}
      />
      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lift">
        <div
          aria-hidden="true"
          className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5"
        >
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <span className="ml-3 truncate rounded-md bg-bg px-3 py-0.5 font-mono text-[11px] text-subtle">
            learnly / typescript-foundations / lesson-3
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <HeroVideo
              playbackId={siteConfig.heroVideo.playbackId}
              title={siteConfig.heroVideo.title}
              durationLabel={siteConfig.heroVideo.durationLabel}
              phase={phase}
              phaseDurationMs={PHASES[0]}
              reduced={reduced}
            />

            <div
              aria-hidden="true"
              className="rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-relaxed text-accent-soft sm:text-xs"
            >
              <pre className="min-h-[3.9em] whitespace-pre-wrap">
                {typed}
                {!reduced && phase >= 1 && phase < 2 ? (
                  <span className="ml-px inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-accent" />
                ) : null}
              </pre>
            </div>
          </div>

          <div aria-hidden="true" className="flex flex-col gap-4">
            <motion.div
              animate={{ opacity: quizOn ? 1 : 0.35 }}
              transition={{ duration: dur }}
              className="rounded-lg border border-line bg-surface-2 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                Quick check
              </p>
              <p className="mt-1 text-xs font-medium">What does `as const` produce?</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {options.map((option, i) => {
                  const picked = quizOn && i === 1;
                  return (
                    <li
                      key={option}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors duration-500",
                        picked ? "border-success/70 bg-success/10 text-fg" : "border-line text-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2.5 rounded-full border",
                          picked ? "border-success bg-success" : "border-line-strong",
                        )}
                      />
                      {option}
                    </li>
                  );
                })}
              </ul>
              <p className={cn("mt-2 text-[11px] text-success transition-opacity", quizOn ? "opacity-100" : "opacity-0")}>
                Correct!
              </p>
            </motion.div>

            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
              <svg viewBox="0 0 64 64" className="size-14 -rotate-90 shrink-0">
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" className="stroke-line-strong" />
                <motion.circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className="stroke-accent"
                  strokeDasharray={RING}
                  initial={false}
                  animate={{ strokeDashoffset: RING * (ringOn ? 0.25 : 0.55) }}
                  transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut" }}
                />
              </svg>
              <div>
                <p className="font-display text-lg font-semibold leading-none">{ringOn ? "75%" : "45%"}</p>
                <p className="mt-1 text-[11px] text-muted">of the course done</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <motion.div
        aria-hidden="true"
        data-testid="tutor-bubble"
        initial={false}
        animate={{ opacity: tutorOn ? 1 : 0, y: tutorOn ? 0 : 16, scale: tutorOn ? 1 : 0.96 }}
        transition={{ duration: dur, ease: "easeOut" }}
        className="absolute -bottom-6 right-2 w-64 rounded-xl border border-iris/50 bg-surface-3 p-3 shadow-lift sm:-right-6"
      >
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-iris-soft">
          <span className="size-2 rounded-full bg-iris" /> AI tutor
        </p>
        <p className="mt-1 text-xs text-fg">
          Nice work on lesson 3. Want a harder quiz on generics, or move on to lesson 4?
        </p>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-iris/20 px-2 py-0.5 text-[10px] text-iris-soft">Quiz me</span>
          <span className="rounded-full bg-iris/20 px-2 py-0.5 text-[10px] text-iris-soft">Next lesson</span>
        </div>
      </motion.div>
    </div>
  );
}
