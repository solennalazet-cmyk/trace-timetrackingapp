import { useEffect, useCallback } from "react";

export type ColorTheme = "sunrise" | "stormy";

const COLOR_THEME_KEY = "trace_color_theme";

/** Apply the color-theme class to <html>. Leaves dark/light untouched. */
export function applyColorTheme(theme: ColorTheme) {
  const root = document.documentElement;
  root.classList.remove("theme-stormy");
  if (theme === "stormy") {
    root.classList.add("theme-stormy");
  }
  localStorage.setItem(COLOR_THEME_KEY, theme);
}

/** Read persisted color theme (defaults to "sunrise"). */
export function getStoredColorTheme(): ColorTheme {
  const stored = localStorage.getItem(COLOR_THEME_KEY);
  if (stored === "stormy") return "stormy";
  return "sunrise";
}

/** Hook that applies the stored color theme on mount and listens for changes. */
export function useColorTheme() {
  useEffect(() => {
    applyColorTheme(getStoredColorTheme());
  }, []);

  const setColorTheme = useCallback((theme: ColorTheme) => {
    applyColorTheme(theme);
    window.dispatchEvent(new Event("trace-settings-changed"));
  }, []);

  return { setColorTheme, getStoredColorTheme };
}
