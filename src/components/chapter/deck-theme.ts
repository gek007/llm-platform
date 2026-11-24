"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export type DeckTheme = "dark" | "light";

const KEY = "learnly.deck.theme";
const CHANGED = "learnly:deck-theme";

// Used when localStorage is unavailable (private mode, blocked site data): the choice then lasts
// for the page only.
let remembered: DeckTheme | null = null;

function read(): DeckTheme {
  if (remembered) return remembered;
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The viewer's deck theme, remembered across decks and visits. Dark (the app's theme) by default. */
export function useStoredDeckTheme(): [DeckTheme, (theme: DeckTheme) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as const);
  const set = (next: DeckTheme) => {
    remembered = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // kept in `remembered`
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [theme, set];
}

/** The theme of the deck a slide is rendered in; visuals redraw when it changes. */
export const DeckThemeContext = createContext<DeckTheme>("dark");
export const useDeckTheme = () => useContext(DeckThemeContext);
