export function chapterSlug(order: number): string {
  return `chapter-${order}`;
}

export function lessonSlug(chapterOrder: number, subOrder: number): string {
  return `lesson-${chapterOrder}-${subOrder}`;
}

/** Latin kebab slug from the title when >= 3 chars survive; else `course-<6 hex>`. Suffix -2, -3 on collision. */
export function courseSlugFor(title: string, existing: Set<string>): string {
  const kebab = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let base: string;
  if (kebab.replace(/-/g, "").length >= 3) base = kebab;
  else {
    do {
      base = `course-${Math.floor(Math.random() * 0x1000000)
        .toString(16)
        .padStart(6, "0")}`;
    } while (existing.has(base));
  }
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
}
