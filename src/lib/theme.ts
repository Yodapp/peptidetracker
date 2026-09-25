import type { PeptimeStore } from "@/lib/types";

type ThemeMode = PeptimeStore["settings"]["themeMode"];

export const THEME_KEY = "peptime-theme";
const colors = { light: "#f2f2f7", dark: "#000000" };

/** Apply the theme class and browser chrome color, and remember the choice for the next launch. */
export function applyThemeMode(mode: ThemeMode = "system") {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", dark ? colors.dark : colors.light));
  try { localStorage.setItem(THEME_KEY, mode); } catch {}
  return dark ? "dark" as const : "light" as const;
}

/** Runs before first paint so a dark theme never flashes light on launch. */
export const themeBootScript = `try{var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.querySelectorAll('meta[name="theme-color"]').forEach(function(e){e.setAttribute("content",d?${JSON.stringify(colors.dark)}:${JSON.stringify(colors.light)})})}catch(e){}`;
