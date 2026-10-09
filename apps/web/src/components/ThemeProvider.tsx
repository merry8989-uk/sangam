"use client";
import { useEffect } from "react";

// Applies the resolved theme's CSS variables to <html>. The server already set
// data-sangam-theme / data-mode, so there is no flash of the wrong theme.
export default function ThemeProvider({
  vars,
  mode,
  id
}: {
  vars: Record<string, string>;
  mode: string;
  id: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-sangam-theme", id);
    root.setAttribute("data-mode", mode);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty("--" + key, value);
    }
  }, [vars, mode, id]);

  return null;
}
