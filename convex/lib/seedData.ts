// Placeholders: ¦ is a backtick, ¦¦¦ a code fence (keeps this file free of escapes).
const md = (s: string) => s.replaceAll("¦", "`");

export type SeedLesson = {
  slug: string;
  title: string;
  summary: string;
  durationMinutes: number;
  isFreePreview: boolean;
  body: string;
};
export type SeedCourse = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  level: "beginner" | "intermediate" | "advanced";
  tier: "free" | "pro";
  tags: string[];
  outcomes: string[];
  lessons: SeedLesson[];
};

export const seedCourses: SeedCourse[] = [
  {
    slug: "typescript-foundations",
    title: "TypeScript Foundations",
    summary: "Types, functions and modules: write JavaScript that catches mistakes before it runs.",
    description: md(`Start from the JavaScript you know and add a type system that works *for* you.

You will learn how the compiler thinks, how to model real data with ¦type¦ and ¦interface¦, and how to keep a growing codebase honest. Every lesson ends with a short check so you know it stuck.`),
    level: "beginner",
    tier: "free",
    tags: ["typescript", "javascript"],
    outcomes: [
      "Read and write type annotations without fighting the compiler",
      "Model data with unions, interfaces and generics",
      "Narrow types safely instead of casting",
      "Organize code into typed modules",
    ],
    lessons: [
      {
        slug: "why-types",
        title: "Why types?",
        summary: "What a type system buys you, and what it doesn't.",
        durationMinutes: 8,
        isFreePreview: true,
        body: md(`# Why types?

JavaScript lets you call anything with anything. That is freedom until a typo reaches production.

## What TypeScript adds

A type checker reads your code *before* it runs and flags calls that cannot work.

¦¦¦ts
function greet(name: string) {
  return ¦Hello, \${name.toUpperCase()}¦;
}

greet(42); // Error: number is not assignable to string
¦¦¦

Types are erased at runtime, so you pay nothing in the browser.

## Check yourself

¦¦¦quiz
{ "question": "When are TypeScript types checked?", "options": ["At runtime in the browser", "Before the code runs, at compile time", "Only when tests run"], "answer": 1, "explanation": "Types are checked at compile time and erased from the emitted JavaScript." }
¦¦¦
`),
      },
      {
        slug: "basic-types",
        title: "Primitives, arrays and objects",
        summary: "Annotate the everyday shapes of data.",
        durationMinutes: 12,
        isFreePreview: false,
        body: md(`# Primitives, arrays and objects

## The primitives

¦string¦, ¦number¦, ¦boolean¦, ¦null¦ and ¦undefined¦ cover most values.

¦¦¦ts
const title: string = "TypeScript";
const lessons: number[] = [1, 2, 3];
const user: { name: string; admin?: boolean } = { name: "Ada" };
¦¦¦

## Inference first

You rarely need to annotate a variable you initialize: ¦const n = 3¦ is already ¦number¦. Annotate function parameters and public return types.

| Annotate | Let inference work |
| -------- | ------------------ |
| Parameters | Local variables |
| Exported return types | Intermediate results |

¦¦¦quiz
{ "question": "Which declaration needs an explicit annotation?", "options": ["const n = 3", "function add(a, b) {}", "const names = ['a', 'b']"], "answer": 1, "explanation": "Function parameters have no initializer to infer from, so annotate them." }
¦¦¦
`),
      },
      {
        slug: "unions-and-narrowing",
        title: "Unions and narrowing",
        summary: "Model 'one of several things' and let the compiler follow your checks.",
        durationMinutes: 14,
        isFreePreview: false,
        body: md(`# Unions and narrowing

A union says a value is *one of* several types.

¦¦¦ts
type Id = string | number;

function show(id: Id) {
  if (typeof id === "string") {
    return id.toUpperCase(); // narrowed to string
  }
  return id.toFixed(0); // narrowed to number
}
¦¦¦

## Discriminated unions

Give each variant a literal tag and ¦switch¦ on it. The compiler checks you handled every case.

¦¦¦ts
type Result =
  | { ok: true; value: number }
  | { ok: false; error: string };
¦¦¦

¦¦¦quiz
{ "question": "What makes a union 'discriminated'?", "options": ["It has more than two members", "Each member has a shared literal-typed tag field", "It only contains primitives"], "answer": 1, "explanation": "A common literal field (like ok: true / false) lets the compiler narrow by checking it." }
¦¦¦
`),
      },
      {
        slug: "generics",
        title: "Generics",
        summary: "Write one function that works for many types without losing safety.",
        durationMinutes: 15,
        isFreePreview: false,
        body: md(`# Generics

Generics are type parameters: a placeholder the caller fills in.

¦¦¦ts
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const n = first([1, 2, 3]); // number | undefined
const s = first(["a"]); // string | undefined
¦¦¦

## Constraints

Use ¦extends¦ to require a shape.

¦¦¦ts
function longest<T extends { length: number }>(a: T, b: T) {
  return a.length >= b.length ? a : b;
}
¦¦¦

¦¦¦quiz
{ "question": "What does <T extends { length: number }> do?", "options": ["Makes T always a number", "Restricts T to types that have a numeric length", "Adds a length property to T"], "answer": 1, "explanation": "A constraint limits which types may be passed while still keeping the specific type." }
¦¦¦
`),
      },
    ],
  },
  {
    slug: "web-accessibility",
    title: "Web Accessibility Essentials",
    summary: "Keyboard support, focus, ARIA and color contrast for interfaces everyone can use.",
    description: md(`Accessibility is a quality bar, not a checklist you bolt on at the end.

This course walks through the four things that fix most real-world problems: semantic HTML, keyboard operation, focus management and contrast. You will test with only a keyboard and a screen reader.`),
    level: "intermediate",
    tier: "free",
    tags: ["accessibility", "html"],
    outcomes: [
      "Choose semantic elements before reaching for ARIA",
      "Make any widget fully keyboard operable",
      "Manage focus for dialogs and route changes",
      "Check color contrast against WCAG AA",
    ],
    lessons: [
      {
        slug: "semantic-html",
        title: "Semantic HTML first",
        summary: "Native elements give you roles, focus and keyboard support for free.",
        durationMinutes: 9,
        isFreePreview: true,
        body: md(`# Semantic HTML first

The first rule of ARIA: don't use ARIA if a native element does the job.

¦¦¦html
<!-- Bad: a div pretending to be a button -->
<div class="btn" onclick="save()">Save</div>

<!-- Good -->
<button type="button" onclick="save()">Save</button>
¦¦¦

A ¦button¦ is focusable, responds to Enter and Space, and is announced as a button. The div does none of that.

¦¦¦quiz
{ "question": "Why prefer <button> over a clickable <div>?", "options": ["It looks nicer by default", "It brings focus, keyboard activation and the right role for free", "Screen readers ignore divs entirely"], "answer": 1, "explanation": "Native elements ship with built-in semantics and keyboard behavior you would otherwise rebuild by hand." }
¦¦¦
`),
      },
      {
        slug: "keyboard-and-focus",
        title: "Keyboard and focus",
        summary: "Every interaction must work without a mouse, and focus must always be visible.",
        durationMinutes: 12,
        isFreePreview: false,
        body: md(`# Keyboard and focus

Unplug your mouse and try your page. Where can you not go?

## Focus order and visibility

Focus order follows the DOM. Never remove the outline without replacing it.

¦¦¦css
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
¦¦¦

## Roving tabindex

Composite widgets (tabs, radio groups) take one tab stop and use arrow keys inside.

¦¦¦quiz
{ "question": "How many Tab stops should a radio group have?", "options": ["One per radio", "One for the whole group, arrows move within", "None, only the mouse selects"], "answer": 1, "explanation": "Radio groups are composite widgets: one tab stop, arrow keys move the selection." }
¦¦¦
`),
      },
      {
        slug: "aria-basics",
        title: "ARIA basics",
        summary: "Roles, states and properties: when native HTML is not enough.",
        durationMinutes: 13,
        isFreePreview: false,
        body: md(`# ARIA basics

ARIA only changes what assistive tech *hears*. It adds no behavior.

## States

¦¦¦tsx
<button aria-expanded={open} aria-controls="menu">
  Menu
</button>
<ul id="menu" hidden={!open}>…</ul>
¦¦¦

Keep ¦aria-expanded¦ in sync with the real state, or you are lying to users.

¦¦¦quiz
{ "question": "What does aria-expanded is true communicate?", "options": ["The element is visually larger", "The controlled region is currently open", "The element has focus"], "answer": 1, "explanation": "It tells assistive technology that the region the control owns is open." }
¦¦¦
`),
      },
      {
        slug: "color-contrast",
        title: "Color and contrast",
        summary: "WCAG AA ratios, and why color alone is never enough.",
        durationMinutes: 8,
        isFreePreview: false,
        body: md(`# Color and contrast

WCAG AA asks for **4.5:1** for body text and **3:1** for large text and UI components.

| Element | Minimum ratio |
| ------- | ------------- |
| Body text | 4.5:1 |
| Large text (24px / 19px bold) | 3:1 |
| Borders, icons, focus rings | 3:1 |

Never use color as the only signal: pair red errors with an icon and text.

¦¦¦quiz
{ "question": "Minimum AA contrast for normal body text?", "options": ["3:1", "4.5:1", "7:1"], "answer": 1, "explanation": "AA requires 4.5:1 for normal text; 7:1 is the stricter AAA level." }
¦¦¦
`),
      },
    ],
  },
  {
    slug: "react-server-components",
    title: "React Server Components in Practice",
    summary: "Server-first React: fetch on the server, ship less JavaScript, and know where the boundary goes.",
    description: md(`Server Components change where your code runs. This Pro course builds a real data-driven page the server-first way, then adds the smallest possible amount of client interactivity.

You will leave with a mental model for the server/client boundary, streaming with Suspense, and caching that doesn't surprise you.`),
    level: "intermediate",
    tier: "pro",
    tags: ["react", "nextjs", "performance"],
    outcomes: [
      "Decide what belongs on the server and what needs use client",
      "Fetch data in Server Components and stream it with Suspense",
      "Pass data across the boundary without leaking secrets",
      "Cache and revalidate with confidence",
    ],
    lessons: [
      {
        slug: "the-mental-model",
        title: "The server-first mental model",
        summary: "Components run on the server by default. Here's what that changes.",
        durationMinutes: 10,
        isFreePreview: true,
        body: md(`# The server-first mental model

A Server Component renders on the server and sends the *result*, not its code, to the browser.

¦¦¦tsx
// app/courses/page.tsx — runs on the server
export default async function Courses() {
  const courses = await db.query("courses");
  return <ul>{courses.map((c) => <li key={c.id}>{c.title}</li>)}</ul>;
}
¦¦¦

No ¦useEffect¦, no loading spinner state, no API route in between.

¦¦¦quiz
{ "question": "What reaches the browser from a Server Component?", "options": ["Its source code", "The rendered output", "Its database credentials"], "answer": 1, "explanation": "Only the rendered result (and any client component references) is sent; server code and secrets stay on the server." }
¦¦¦
`),
      },
      {
        slug: "the-client-boundary",
        title: "Placing the client boundary",
        summary: "Push ¦use client¦ down to the smallest interactive leaf.",
        durationMinutes: 14,
        isFreePreview: false,
        body: md(`# Placing the client boundary

¦"use client"¦ marks the *entry point* of client code. Everything it imports becomes client code too.

## Push it to the leaves

¦¦¦tsx
// Server: static markup + data
export function CourseCard({ course }: { course: Course }) {
  return (
    <article>
      <h2>{course.title}</h2>
      <LikeButton courseId={course.id} /> {/* only this is client */}
    </article>
  );
}
¦¦¦

Wrap only the interactive bit. The rest stays server-rendered and ships zero JavaScript.

¦¦¦quiz
{ "question": "Where should 'use client' usually go?", "options": ["At the top of every file", "On the smallest interactive component", "In the root layout"], "answer": 1, "explanation": "Keeping the boundary at the leaf maximizes server-rendered, JavaScript-free output." }
¦¦¦
`),
      },
      {
        slug: "streaming-with-suspense",
        title: "Streaming with Suspense",
        summary: "Show the shell instantly and stream slow data in as it resolves.",
        durationMinutes: 16,
        isFreePreview: false,
        body: md(`# Streaming with Suspense

Slow data shouldn't block the whole page.

¦¦¦tsx
export default function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<Skeleton />}>
        <Recommendations />
      </Suspense>
    </>
  );
}
¦¦¦

The header paints right away; ¦Recommendations¦ streams in when its promise resolves.

¦¦¦quiz
{ "question": "What does <Suspense> let you do?", "options": ["Cancel a request", "Show a fallback while part of the tree is still loading", "Run code on the client only"], "answer": 1, "explanation": "Suspense shows a fallback while a child waits for data, so the rest of the page isn't blocked." }
¦¦¦
`),
      },
      {
        slug: "caching-and-revalidation",
        title: "Caching and revalidation",
        summary: "Decide what is static, what is per-user and when it refreshes.",
        durationMinutes: 15,
        isFreePreview: false,
        body: md(`# Caching and revalidation

Three questions per piece of data: *who sees it*, *how fresh must it be*, *what changes it*.

| Data | Strategy |
| ---- | -------- |
| Course catalog | Cache, revalidate on publish |
| A user's progress | Never shared; read per request |
| Pricing | Cache for a long time |

¦¦¦ts
"use cache";
import { cacheLife } from "next/cache";

export async function getCatalog() {
  cacheLife("hours");
  return await db.query("courses");
}
¦¦¦

¦¦¦quiz
{ "question": "Which data must NOT be cached across users?", "options": ["The public course catalog", "A signed-in user's progress", "The pricing page copy"], "answer": 1, "explanation": "Per-user data must be read per request or keyed by user; sharing it leaks one user's data to another." }
¦¦¦
`),
      },
    ],
  },
  {
    slug: "realtime-backends",
    title: "Building Realtime Backends",
    summary: "Model data, write transactional functions and sync it live to the UI.",
    description: md(`Build a collaborative app on a reactive database. This advanced Pro course covers schema design, indexes, transactional mutations and optimistic UI, using Convex throughout.

By the end you will have shipped a live feature end to end and know how to keep it fast as data grows.`),
    level: "advanced",
    tier: "pro",
    tags: ["backend", "databases", "convex"],
    outcomes: [
      "Design a schema and indexes for the queries you actually run",
      "Write queries and mutations that are transactional by default",
      "Enforce authorization on the server, never the client",
      "Add optimistic updates without desyncing the UI",
    ],
    lessons: [
      {
        slug: "reactive-queries",
        title: "Reactive queries",
        summary: "Why queries re-run on their own and what that means for your UI.",
        durationMinutes: 11,
        isFreePreview: true,
        body: md(`# Reactive queries

In a reactive backend a query is a *subscription*: when the data it read changes, it re-runs and pushes the new result.

¦¦¦ts
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").order("desc").take(50);
  },
});
¦¦¦

On the client, ¦useQuery(api.messages.list)¦ stays current with no polling.

¦¦¦quiz
{ "question": "When does a reactive query re-run?", "options": ["Every second", "When data it read changes", "Only on page refresh"], "answer": 1, "explanation": "The backend tracks what the query read and re-runs it when those documents change." }
¦¦¦
`),
      },
      {
        slug: "schema-and-indexes",
        title: "Schema and indexes",
        summary: "Model for your reads and never scan a whole table.",
        durationMinutes: 15,
        isFreePreview: false,
        body: md(`# Schema and indexes

Design the index before the query.

¦¦¦ts
messages: defineTable({
  channelId: v.id("channels"),
  authorId: v.string(),
  text: v.string(),
}).index("by_channel", ["channelId"]),
¦¦¦

¦¦¦ts
await ctx.db
  .query("messages")
  .withIndex("by_channel", (q) => q.eq("channelId", channelId))
  .take(50);
¦¦¦

Prefer ¦withIndex¦ over ¦filter¦: an index reads only the matching documents.

¦¦¦quiz
{ "question": "Why use withIndex instead of filter?", "options": ["It is shorter to type", "It reads only matching documents instead of scanning the table", "It makes the query reactive"], "answer": 1, "explanation": "An index jumps straight to the matching range; filter scans every document." }
¦¦¦
`),
      },
      {
        slug: "transactional-mutations",
        title: "Transactional mutations",
        summary: "Every mutation is a transaction, so write them to be idempotent.",
        durationMinutes: 14,
        isFreePreview: false,
        body: md(`# Transactional mutations

A mutation either fully commits or not at all, and conflicting writes are retried automatically.

¦¦¦ts
export const enroll = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", me.subject).eq("courseId", courseId))
      .unique();
    if (existing) return existing._id; // idempotent
    return ctx.db.insert("enrollments", { userId: me.subject, courseId, enrolledAt: Date.now() });
  },
});
¦¦¦

Because retries can happen, check-then-insert like this is safe: the check and write are in one transaction.

¦¦¦quiz
{ "question": "Why make a mutation idempotent?", "options": ["Retries and double clicks must not create duplicates", "It makes the mutation faster", "Convex requires it"], "answer": 0, "explanation": "Mutations can be retried and users double click; idempotent code gives the same result either way." }
¦¦¦
`),
      },
      {
        slug: "authorization-on-the-server",
        title: "Authorization on the server",
        summary: "Never send what the viewer may not see.",
        durationMinutes: 13,
        isFreePreview: false,
        body: md(`# Authorization on the server

Hiding a locked lesson in the UI is cosmetic. The query must never return the data at all.

¦¦¦ts
const locked = !canAccessLesson({ course, lesson, ...viewer });
return { lesson: locked ? withoutBody(lesson) : lesson, locked };
¦¦¦

Keep the rule in one pure function, and unit-test it.

¦¦¦quiz
{ "question": "Where must access to paid content be enforced?", "options": ["In the React component", "In the server function that returns the data", "In the CSS"], "answer": 1, "explanation": "Anything sent to the browser can be read. Only server-side checks keep paid content private." }
¦¦¦
`),
      },
    ],
  },
];
export { seedChapteredCourses, type SeedChapteredCourse } from "./seedChapteredData";
