import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sunrise palette – harmonises with the brand gradient */
export const SUNRISE_PALETTE = [
  "hsl(38 92% 55%)", "hsl(22 88% 55%)", "hsl(340 72% 55%)", "hsl(310 60% 52%)",
  "hsl(270 58% 58%)", "hsl(220 75% 58%)", "hsl(190 70% 48%)", "hsl(355 68% 52%)",
  "hsl(50 85% 52%)", "hsl(285 55% 52%)",
];

/** Stormy Skies palette – blue-tinted grey tones inspired by coastal storms */
export const STORMY_SKIES_PALETTE = [
  "hsl(210 16% 72%)", "hsl(212 22% 56%)", "hsl(215 28% 38%)", "hsl(210 14% 48%)",
  "hsl(208 12% 80%)", "hsl(212 32% 24%)", "hsl(210 18% 62%)", "hsl(208 16% 50%)",
  "hsl(215 34% 18%)", "hsl(210 14% 76%)",
];

const hashStringToIndex = (str: string, max: number): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash) % max;
};

/** Deterministic color for a client ID – always uses the colorful Sunrise palette
 *  regardless of UI theme, so charts/chips stay vibrant. */
export const getClientColor = (id: string) => {
  return SUNRISE_PALETTE[hashStringToIndex(id, SUNRISE_PALETTE.length)];
};

/** Convert a Date to a local YYYY-MM-DD string (timezone-safe). */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
