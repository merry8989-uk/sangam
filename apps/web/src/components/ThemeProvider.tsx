"use client";
import { useEffect } from "react";

// Applies the resolved theme's CSS variables to <html>. The server already set
// data-sangam-theme / data-mode, so there is no flash of the wrong theme.
export default function ThemeProvider({
  vars,
  mode,
  id,
  background
}: {
  vars: Record<string, string>;
  mode: string;
  id: string;
  /** A resolved, already-validated CSS value. Never raw user input. */
  background?: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-sangam-theme", id);
    root.setAttribute("data-mode", mode);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty("--" + key, value);
    }
    // Set here rather than in a style attribute so the rotation survives a
    // client navigation without the server sending it again.
    if (background) root.style.setProperty("--sangam-background", background);
    else root.style.removeProperty("--sangam-background");
  }, [vars, mode, id, background]);

  return null;
}
