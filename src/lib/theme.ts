import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "marcador_theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.dataset.theme = theme;
}

const listeners = new Set<(t: Theme) => void>();

export function setTheme(theme: Theme, opts: { persist?: boolean } = {}) {
  applyTheme(theme);
  if (opts.persist !== false) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l(theme));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      const cls = document.documentElement.classList;
      if (cls.contains("light")) return "light";
      if (cls.contains("dark")) return "dark";
    }
    return getInitialTheme();
  });

  useEffect(() => {
    const onChange = (t: Theme) => setThemeState(t);
    listeners.add(onChange);
    // Sync once on mount in case the inline script ran before hydration mismatched.
    const cls = document.documentElement.classList;
    const current: Theme = cls.contains("light") ? "light" : "dark";
    if (current !== theme) setThemeState(current);
    return () => {
      listeners.delete(onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [theme, (t: Theme) => setTheme(t)];
}

export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_KEY}');var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var r=document.documentElement;r.classList.remove('dark','light');r.classList.add(t);r.dataset.theme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;
