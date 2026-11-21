import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

// Mirrors the tokens in globals.css (Clerk needs literal colors, not CSS variables, for computed shades).
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#ff8a3d",
    colorPrimaryForeground: "#1a0d02",
    colorBackground: "#0f1117",
    colorForeground: "#efece4",
    colorMuted: "#161923",
    colorMutedForeground: "#9aa0b4",
    colorInput: "#161923",
    colorInputForeground: "#efece4",
    colorBorder: "#373e54",
    colorNeutral: "#efece4",
    colorDanger: "#ff6b7a",
    colorSuccess: "#4fd6a0",
    colorRing: "#ff8a3d",
    borderRadius: "0.75rem",
  },
};
