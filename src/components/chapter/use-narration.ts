"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Language } from "../../../convex/lib/engineTypes";

/**
 * Slide narration with the browser's own voice (the Web Speech API): free, no account and nothing
 * stored, at the price of a voice that depends on the learner's device. A device may have no voice
 * for a language at all (Hebrew and Russian are not installed everywhere); the deck says so instead
 * of reading the text in the wrong voice.
 *
 * The text is spoken one short chunk at a time. Chrome cuts off a long utterance of a network voice
 * after about 15 seconds, and a chunk is also where a stop resumes from and what the caption shows.
 */

export const SPEECH_LANG: Record<Language, string> = { en: "en-US", he: "he-IL", ru: "ru-RU" };
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", he: "Hebrew", ru: "Russian" };
/** Some browsers still tag Hebrew voices with the retired code `iw`. */
const LANGUAGE_CODES: Record<Language, string[]> = { en: ["en"], he: ["he", "iw"], ru: ["ru"] };

const CHUNK_MAX = 220;

/** Sentences of the notes; a sentence longer than `CHUNK_MAX` is split again at its commas. */
export function narrationChunks(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.flatMap((sentence) => {
    if (sentence.length <= CHUNK_MAX) return [sentence];
    const chunks: string[] = [];
    let current = "";
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      if (current && `${current} ${part}`.length > CHUNK_MAX) {
        chunks.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
    return current ? [...chunks, current] : chunks;
  });
}

type VoiceLike = Pick<SpeechSynthesisVoice, "lang" | "name" | "default">;

/**
 * The device's voices for the language, best first: the expected region (en-US, he-IL, ru-RU), then
 * the higher-quality voices browsers mark in the name, then the browser's default. Voices of other
 * languages are left out: they would mispronounce the text, not translate it.
 */
export function voicesFor<V extends VoiceLike>(voices: readonly V[], language: Language): V[] {
  const tag = (voice: V) => voice.lang.toLowerCase().replace("_", "-");
  const score = (voice: V) =>
    (tag(voice) === SPEECH_LANG[language].toLowerCase() ? 4 : 0) +
    (/natural|neural|enhanced|premium|siri|google/i.test(voice.name) ? 2 : 0) +
    (voice.default ? 1 : 0);
  return voices
    .filter((voice) => LANGUAGE_CODES[language].some((code) => tag(voice).split("-")[0] === code))
    .map((voice, order) => ({ voice, order }))
    .sort((a, b) => score(b.voice) - score(a.voice) || a.order - b.order)
    .map(({ voice }) => voice);
}

/** The device's best voice for the language, or null when it has none. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], language: Language): V | null {
  return voicesFor(voices, language)[0] ?? null;
}

const VOICE_CHANGED = "learnly:deck-voice";
const voiceKey = (language: Language) => `learnly.deck.voice.${language}`;
// Used when localStorage is unavailable: the choice then lasts for the page only.
const rememberedVoices = new Map<Language, string>();

/** The voice the viewer chose for a language (by name), remembered across decks and visits. */
function readChosenVoice(language: Language): string | null {
  try {
    return window.localStorage.getItem(voiceKey(language));
  } catch {
    return rememberedVoices.get(language) ?? null;
  }
}

function subscribeToChosenVoice(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VOICE_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VOICE_CHANGED, onChange);
  };
}

const NO_VOICES: SpeechSynthesisVoice[] = [];
let knownVoices: SpeechSynthesisVoice[] = NO_VOICES;

const speechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";

// Browsers load their voices after the page; `getVoices()` returns a new array on every call, so the
// list is kept here and replaced only when the browser says it changed.
function subscribeToVoices(onChange: () => void) {
  if (!speechSupported()) return () => {};
  const synth = window.speechSynthesis;
  const refresh = () => {
    knownVoices = synth.getVoices();
    onChange();
  };
  // Read once on subscribing too: the list may have loaded since it was last looked at.
  knownVoices = synth.getVoices();
  synth.addEventListener?.("voiceschanged", refresh);
  return () => synth.removeEventListener?.("voiceschanged", refresh);
}

function currentVoices() {
  if (knownVoices.length === 0 && speechSupported()) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) knownVoices = voices;
  }
  return knownVoices;
}

const subscribeToNothing = () => () => {};

type Options = {
  /** Identifies the slide: a new key starts its notes from the beginning. */
  slideKey: string;
  text: string;
  language: Language;
  /** True while the slide is not on screen (the overview is open): narration waits. */
  paused?: boolean;
  /** The slide's notes are finished. Return true when another slide follows (narration goes on). */
  onSlideEnd: () => boolean;
};

export function useNarration({ slideKey, text, language, paused = false, onSlideEnd }: Options) {
  const supported = useSyncExternalStore(subscribeToNothing, speechSupported, () => false);
  const voices = useSyncExternalStore(subscribeToVoices, currentVoices, () => NO_VOICES);
  const options = useMemo(() => voicesFor(voices, language), [voices, language]);
  const chosen = useSyncExternalStore(
    subscribeToChosenVoice,
    () => readChosenVoice(language),
    () => null,
  );
  // The viewer's choice when this device still has it, else the best voice for the language.
  const voice = options.find((option) => option.name === chosen) ?? options[0] ?? null;
  const chunks = useMemo(() => narrationChunks(text), [text]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState({ key: slideKey, index: 0 });
  const index = position.key === slideKey ? position.index : 0;

  const slideEnded = useRef(onSlideEnd);
  useEffect(() => {
    slideEnded.current = onSlideEnd;
  });

  useEffect(() => {
    if (!playing || paused || !voice) return;
    const synth = window.speechSynthesis;
    let cancelled = false;
    const finishSlide = () => {
      if (!slideEnded.current()) setPlaying(false);
    };
    const chunk = chunks[index];
    if (chunk === undefined) {
      // A slide without notes: nothing to say, move on.
      const timer = setTimeout(() => !cancelled && finishSlide(), 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = () => {
      if (cancelled) return;
      if (index + 1 < chunks.length) setPosition({ key: slideKey, index: index + 1 });
      else finishSlide();
    };
    utterance.onerror = (event) => {
      // Cancelling (a stop, a slide change) also ends an utterance with an error; that is not one.
      if (cancelled || event.error === "interrupted" || event.error === "canceled") return;
      console.warn(`[SlideDeck] narration stopped: ${event.error}`);
      setPlaying(false);
    };
    // Chrome can be left paused by an earlier cancel; resume first or nothing is spoken.
    synth.cancel();
    synth.resume();
    synth.speak(utterance);
    return () => {
      cancelled = true;
      synth.cancel();
    };
  }, [playing, paused, voice, chunks, index, slideKey]);

  /** Starts (or resumes, from the interrupted sentence). False when the device has no voice for the language. */
  const play = useCallback(() => {
    if (!voice) return false;
    setPlaying(true);
    return true;
  }, [voice]);
  const stop = useCallback(() => setPlaying(false), []);
  /** Chooses one of `voices` by name; narration in progress continues in the new voice. */
  const setVoice = useCallback(
    (name: string) => {
      try {
        window.localStorage.setItem(voiceKey(language), name);
      } catch {
        rememberedVoices.set(language, name);
      }
      window.dispatchEvent(new Event(VOICE_CHANGED));
    },
    [language],
  );

  return {
    /** The device's voices for the course language, best first. */
    voices: options,
    voiceName: voice?.name ?? null,
    setVoice,
    /** The browser can speak at all; without it the deck shows no narration controls. */
    supported,
    playing,
    /** The sentence being read, to show as a caption. */
    caption: playing && !paused ? (chunks[index] ?? null) : null,
    play,
    stop,
  };
}
