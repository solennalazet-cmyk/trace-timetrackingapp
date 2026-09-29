/** Tax-year preferences for the Payments "Paid" total. Stored per device. */

export interface TaxCountry {
  code: string;
  name: string;
  /** Month (1-12) and day the tax year starts. */
  month: number;
  day: number;
}

export const TAX_COUNTRIES: TaxCountry[] = [
  { code: "PT", name: "Portugal", month: 1, day: 1 },
  { code: "FR", name: "France", month: 1, day: 1 },
  { code: "ES", name: "Spain", month: 1, day: 1 },
  { code: "DE", name: "Germany", month: 1, day: 1 },
  { code: "IT", name: "Italy", month: 1, day: 1 },
  { code: "NL", name: "Netherlands", month: 1, day: 1 },
  { code: "BE", name: "Belgium", month: 1, day: 1 },
  { code: "IE", name: "Ireland", month: 1, day: 1 },
  { code: "CH", name: "Switzerland", month: 1, day: 1 },
  { code: "US", name: "United States", month: 1, day: 1 },
  { code: "BR", name: "Brazil", month: 1, day: 1 },
  { code: "GB", name: "United Kingdom", month: 4, day: 6 },
  { code: "CA", name: "Canada", month: 1, day: 1 },
  { code: "AU", name: "Australia", month: 7, day: 1 },
  { code: "NZ", name: "New Zealand", month: 4, day: 1 },
  { code: "IN", name: "India", month: 4, day: 1 },
];

const KEY = "trace-tax-country";
const NOTICE_KEY = "trace-tax-country-notice-seen";

export function guessCountryCode(): string {
  try {
    const langs = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
    for (const l of langs) {
      const region = l.split("-")[1]?.toUpperCase();
      if (region && TAX_COUNTRIES.some((c) => c.code === region)) return region;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (tz === "Europe/Lisbon" || tz.startsWith("Atlantic/Madeira") || tz.startsWith("Atlantic/Azores")) return "PT";
    if (tz === "Europe/London") return "GB";
    if (tz === "Europe/Paris") return "FR";
    if (tz === "Europe/Madrid") return "ES";
    if (tz.startsWith("Australia/")) return "AU";
  } catch { /* ignore */ }
  return "PT";
}

export function getTaxCountry(): { country: TaxCountry; assumed: boolean } {
  const saved = localStorage.getItem(KEY);
  const code = saved ?? guessCountryCode();
  const country = TAX_COUNTRIES.find((c) => c.code === code) ?? TAX_COUNTRIES[0];
  return { country, assumed: !saved };
}

export function setTaxCountry(code: string) {
  localStorage.setItem(KEY, code);
  localStorage.setItem(NOTICE_KEY, "1");
  window.dispatchEvent(new Event("trace-settings-changed"));
}

export const taxNoticeSeen = () => localStorage.getItem(NOTICE_KEY) === "1";
export const markTaxNoticeSeen = () => localStorage.setItem(NOTICE_KEY, "1");

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Current tax year [start, end] as local YYYY-MM-DD keys. */
export function taxYearRange(country: TaxCountry, offsetYears = 0, today = new Date()): { start: string; end: string } {
  let y = today.getFullYear();
  const startThisYear = new Date(y, country.month - 1, country.day);
  if (today < startThisYear) y -= 1;
  y += offsetYears;
  const start = new Date(y, country.month - 1, country.day);
  const end = new Date(y + 1, country.month - 1, country.day - 1);
  return { start: key(start), end: key(end) };
}

/** Four quarters of a tax year. */
export function taxQuarters(range: { start: string }): { label: string; start: string; end: string }[] {
  const s = new Date(range.start + "T00:00:00");
  return [0, 1, 2, 3].map((i) => {
    const qs = new Date(s.getFullYear(), s.getMonth() + i * 3, s.getDate());
    const qe = new Date(s.getFullYear(), s.getMonth() + (i + 1) * 3, s.getDate() - 1);
    return { label: `Q${i + 1}`, start: key(qs), end: key(qe) };
  });
}
