import type { FakeJob } from "./fake-engine";

/**
 * The deck eval's course, "How DNS works": one chapter whose two lessons and test are already
 * saved, so only the slide deck is missing. A `write` command on it is a resumed write: the chapter
 * writer is skipped and the deck pipeline alone runs (evals/dns-deck.eval.ts). The lessons state a
 * process, a structure, a comparison and a few numbers on purpose, so the deck has something to
 * draw; the timings are marked as an example in the text.
 */

const LESSON_1 = `## From a name to an address

People remember names such as \`example.com\`. Computers route traffic by IP address, such as \`93.184.216.34\`. The Domain Name System (DNS) is the lookup service that turns one into the other. It is often called the phone book of the internet [1].

## Who takes part in a lookup

Four kinds of server work together:

| Server | What it does |
| --- | --- |
| Recursive resolver | Takes your question and does the legwork of finding the answer. Usually run by your internet provider or a public service. |
| Root name server | Knows which servers handle each top-level domain such as \`.com\` or \`.org\`. |
| TLD name server | Knows which servers are authoritative for each domain under its top-level domain. |
| Authoritative name server | Holds the actual records of one domain and gives the final answer. |

There are 13 root server names, \`a.root-servers.net\` to \`m.root-servers.net\`. Each name is served from many machines around the world.

## The steps of an uncached lookup

1. Your device (the stub resolver) asks the recursive resolver for \`www.example.com\`.
2. The resolver asks a root server, which answers: "ask the \`.com\` servers".
3. The resolver asks a \`.com\` TLD server, which answers: "ask the name servers of \`example.com\`".
4. The resolver asks the authoritative server of \`example.com\`, which answers with the IP address.
5. The resolver returns the address to your device and keeps a copy.

Your device asks one question and gets one answer: this is a **recursive** query. The resolver's own questions to the root, TLD and authoritative servers are **iterative** queries: each answer is a referral to the next server, until the last one.

Most DNS questions travel over UDP on port 53. A response that is too large for UDP is sent again over TCP.

## Try it

\`\`\`bash
dig www.example.com A +short
dig www.example.com A +trace
\`\`\`

The first command prints the address. The second shows every referral from the root down.

\`\`\`quiz
{"question":"Which server holds the actual records of a domain?","options":["The root name server","The TLD name server","The authoritative name server"],"answer":2,"explanation":"The root and TLD servers only refer the resolver onward; the authoritative server holds the records."}
\`\`\`
`;

const LESSON_2 = `## What a record is

An authoritative server answers with **resource records**. Each record has a name, a type, a time to live (TTL) and a value.

| Type | Holds | Example value |
| --- | --- | --- |
| A | An IPv4 address | \`93.184.216.34\` |
| AAAA | An IPv6 address | \`2606:2800:220:1:248:1893:25c8:1946\` |
| CNAME | An alias to another name | \`www.example.com\` → \`example.com\` |
| MX | The mail server of the domain | \`10 mail.example.com\` |
| NS | The domain's authoritative name servers | \`ns1.example.com\` |
| TXT | Free text, often used to prove ownership | \`v=spf1 -all\` |

## Caching and TTL

Asking four servers for every name would be slow, so every answer is cached. The TTL says for how many seconds a copy may be reused:

| TTL (seconds) | Means |
| --- | --- |
| 300 | 5 minutes |
| 3600 | 1 hour |
| 86400 | 1 day |

Copies live in three places: the browser, the operating system and the recursive resolver. A lookup stops at the first cache that still holds a fresh copy.

A short TTL lets a change reach users quickly but sends more questions to the authoritative server. A long TTL cuts traffic but makes a change slow to spread. This is why a DNS change can seem to "take time to propagate": old copies are served until their TTL runs out.

## How much caching saves

As an illustration, here is one uncached lookup and the same lookup a moment later (example timings, in milliseconds):

| Step | Time (ms) |
| --- | --- |
| Root server | 20 |
| TLD server | 30 |
| Authoritative server | 40 |
| Answer from the resolver's cache | 1 |

The uncached lookup takes 90 ms in total; the cached one about 1 ms.

\`\`\`quiz
{"question":"A record has a TTL of 3600. For how long may a resolver reuse its copy?","options":["5 minutes","1 hour","1 day"],"answer":1,"explanation":"TTL is in seconds: 3600 seconds is 1 hour."}
\`\`\`
`;

const QUESTIONS = [
  { id: "q1", kind: "single" as const, prompt: "What does DNS do?", options: ["Encrypts web traffic", "Turns domain names into IP addresses", "Assigns IP addresses to devices"], correct: [1], explanation: "DNS is the lookup service from names to addresses." },
  { id: "q2", kind: "single" as const, prompt: "Which server does your device ask first?", options: ["The recursive resolver", "A root name server", "The authoritative name server"], correct: [0], explanation: "The stub resolver on your device asks the recursive resolver." },
  { id: "q3", kind: "true_false" as const, prompt: "A root name server answers with the final IP address of a site.", options: ["True", "False"], correct: [1], explanation: "It refers the resolver to the TLD servers." },
  { id: "q4", kind: "single" as const, prompt: "How many root server names are there?", options: ["4", "13", "100"], correct: [1], explanation: "There are 13 names, a to m, each served from many machines." },
  { id: "q5", kind: "single" as const, prompt: "Which record type holds an IPv6 address?", options: ["A", "AAAA", "MX"], correct: [1], explanation: "AAAA holds an IPv6 address; A holds IPv4." },
  { id: "q6", kind: "multiple" as const, prompt: "Where are DNS answers cached? Select all that apply.", options: ["The browser", "The operating system", "The recursive resolver", "The root name server"], correct: [0, 1, 2], explanation: "Browser, operating system and resolver keep copies; the root server only refers." },
  { id: "q7", kind: "single" as const, prompt: "A record has a TTL of 300. How long may a copy be reused?", options: ["5 minutes", "1 hour", "1 day"], correct: [0], explanation: "300 seconds is 5 minutes." },
  { id: "q8", kind: "true_false" as const, prompt: "A long TTL makes a DNS change reach users faster.", options: ["True", "False"], correct: [1], explanation: "Old copies are served until the TTL runs out, so a long TTL slows a change." },
];

export function dnsCourseJob(): FakeJob {
  const chapterTitle = "How a DNS lookup works";
  const chapterGoal = "Follow a domain name from the browser to its IP address and explain why caching makes lookups fast.";
  const lessons = [
    { title: "From a name to an address", goal: "Name the servers in a DNS lookup and the order in which they are asked.", body: LESSON_1 },
    { title: "Records, caching and TTL", goal: "Read common record types and explain what a TTL controls.", body: LESSON_2 },
  ];
  return {
    jobId: "fakejob_dns_deck",
    status: "writing",
    topic: "How DNS works",
    language: "en",
    level: "beginner",
    length: "short",
    audience: "Developers who are new to networking",
    resources: [],
    sources: [
      {
        id: "src_dns_intro",
        url: "https://example.org/what-is-dns",
        title: "What is DNS? (eval fixture)",
        kind: "web",
        excerpt:
          "The Domain Name System (DNS) is the phone book of the internet. People access information online through domain names, while web browsers interact through Internet Protocol (IP) addresses. DNS translates domain names to IP addresses so browsers can load internet resources.",
      },
    ],
    outline: {
      chapters: [{ title: chapterTitle, goal: chapterGoal, subchapters: lessons.map(({ title, goal }) => ({ title, goal })) }],
    },
    courseId: "fakecourse_dns",
    chapters: [
      {
        order: 1,
        title: chapterTitle,
        summary: chapterGoal,
        lessons: lessons.map((l, i) => ({ order: i + 1, title: l.title, summary: l.goal, body: l.body, sourceIds: i === 0 ? ["src_dns_intro"] : [] })),
        test: { questions: QUESTIONS, version: 1 },
      },
    ],
  };
}
