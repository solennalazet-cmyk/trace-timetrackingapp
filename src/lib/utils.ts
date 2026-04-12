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

/** Stormy Skies palette – cool blue-grey tones */
export const STORMY_SKIES_PALETTE = [
  "hsl(212 18% 70%)", "hsl(214 18% 58%)", "hsl(220 24% 42%)", "hsl(214 14% 48%)",
  "hsl(208 16% 82%)", "hsl(223 24% 28%)", "hsl(216 18% 64%)", "hsl(210 12% 52%)",
  "hsl(220 30% 20%)", "hsl(214 20% 76%)",
];

const hashStringToIndex = (str: string, max: number): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash) % max;
};

/** Deterministic color for a client ID – stays the same across sessions */
export const getClientColor = (id: string) => {
  const isStormy = document.documentElement.classList.contains("theme-stormy");
  const palette = isStormy ? STORMY_SKIES_PALETTE : SUNRISE_PALETTE;
  return palette[hashStringToIndex(id, palette.length)];
};

/** Convert a Date to a local YYYY-MM-DD string (timezone-safe). */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
