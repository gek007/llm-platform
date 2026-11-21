export const siteConfig = {
  name: "Learnly",
  description:
    "Hands-on courses, rich lessons and an AI tutor that knows where you are in the material.",
  nav: [
    { href: "/courses", label: "Courses" },
    { href: "/pricing", label: "Pricing" },
  ],
  heroVideo: {
    playbackId:
      process.env.NEXT_PUBLIC_HERO_MUX_PLAYBACK_ID ||
      "PdxEebalRZQBn02792cVqC02jmAjtHNHFGHSai013BOfsU",
    title: "Learnly studio preview",
    durationLabel: "0:08",
  },
  // Placeholder content: the owner fills this in.
  tutor: {
    name: "Alex Rivera",
    role: "Instructor and founder",
    bio: "Alex has spent a decade building web products and teaching others to do the same. Every course on Learnly is a path Alex wished existed when starting out: practical, opinionated and built around real projects.",
    photo: "/tutor.svg",
    socials: [
      { label: "X", href: "https://x.com" },
      { label: "GitHub", href: "https://github.com" },
      { label: "YouTube", href: "https://youtube.com" },
    ],
  },
} as const;
