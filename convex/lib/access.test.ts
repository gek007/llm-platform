import { describe, expect, it } from "vitest";
import { canAccessLesson } from "./access";

const base = { signedIn: true, pro: false, admin: false };
const free = { tier: "free" as const };
const pro = { tier: "pro" as const };
const normal = { isFreePreview: false };
const preview = { isFreePreview: true };

describe("canAccessLesson", () => {
  it("lets signed-in users into free courses", () => {
    expect(canAccessLesson({ course: free, lesson: normal, ...base })).toBe(true);
  });
  it("hides non-preview free lessons from signed-out users", () => {
    expect(canAccessLesson({ course: free, lesson: normal, ...base, signedIn: false })).toBe(false);
  });
  it("opens free previews to everyone, even signed out, even in pro courses", () => {
    expect(
      canAccessLesson({ course: pro, lesson: preview, signedIn: false, pro: false, admin: false }),
    ).toBe(true);
  });
  it("locks pro courses for free users", () => {
    expect(canAccessLesson({ course: pro, lesson: normal, ...base })).toBe(false);
  });
  it("opens pro courses for pro members", () => {
    expect(canAccessLesson({ course: pro, lesson: normal, ...base, pro: true })).toBe(true);
  });
  it("never opens pro courses for signed-out users, even with a stale pro flag", () => {
    expect(
      canAccessLesson({ course: pro, lesson: normal, signedIn: false, pro: true, admin: false }),
    ).toBe(false);
  });
  it("opens everything for admins", () => {
    expect(
      canAccessLesson({ course: pro, lesson: normal, signedIn: true, pro: false, admin: true }),
    ).toBe(true);
  });
});
