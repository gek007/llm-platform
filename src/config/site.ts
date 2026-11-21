export const siteConfig = {
  name: "Learnly",
  description:
    "Hands-on courses, rich lessons and an AI tutor that knows where you are in the material.",
  nav: [
    { href: "/courses", label: "Courses" },
    { href: "/pricing", label: "Pricing" },
  ],
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
