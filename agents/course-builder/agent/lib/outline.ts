import {
  LENGTH_PRESETS,
  MAX_CHAPTERS,
  MAX_SUBCHAPTERS,
  type Length,
  type Outline,
} from "../../../../convex/lib/engineTypes";

/** Why an outline doesn't fit the job's length preset (and the hard caps), or null when it fits. */
export function outlineProblem(outline: Outline, length: Length): string | null {
  const preset = LENGTH_PRESETS[length];
  const subRange = preset.minSub === preset.maxSub ? `${preset.minSub}` : `${preset.minSub}-${preset.maxSub}`;
  const rule = `A ${length} course has exactly ${preset.chapters} chapters with ${subRange} subchapters each`;
  const n = outline.chapters.length;
  if (n !== preset.chapters || n > MAX_CHAPTERS) {
    return `${rule}; this outline has ${n} chapters. Merge or split chapters and save again.`;
  }
  const bad = outline.chapters.flatMap((ch, i) => {
    const s = ch.subchapters.length;
    return s < preset.minSub || s > preset.maxSub || s > MAX_SUBCHAPTERS ? [`chapter ${i + 1} has ${s} subchapters`] : [];
  });
  if (bad.length > 0) return `${rule}; ${bad.join(", ")}. Adjust them and save again.`;
  return null;
}
