// Theme engine for the mobile app. Mirrors apps/web/src/lib/themes.ts:
// 10 families x 8 accents x 6 gradients = 480 themes.
export type Theme = {
  id: string;
  name: string;
  family: string;
  mode: "light" | "dark";
  vars: Record<string, string>;
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];
const css = (c: RGB) => c.join(" ");
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

const FAMILIES = [
  { key: "noir", name: "Noir", mode: "dark", base: "#0f172a", mood: "sad" },
  { key: "midnight", name: "Midnight", mode: "dark", base: "#1e1b4b", mood: "sad" },
  { key: "nature", name: "Nature", mode: "light", base: "#166534", mood: "evergreen" },
  { key: "forest", name: "Forest", mode: "dark", base: "#14532d", mood: "evergreen" },
  { key: "devotion", name: "Devotion", mode: "light", base: "#b45309", mood: "devotion" },
  { key: "temple", name: "Temple", mode: "dark", base: "#78350f", mood: "devotion" },
  { key: "festive", name: "Festive", mode: "light", base: "#be185d", mood: "festive" },
  { key: "calm", name: "Calm", mode: "light", base: "#0e7490", mood: "calm" },
  { key: "energy", name: "Energy", mode: "light", base: "#ea580c", mood: "energetic" },
  { key: "ocean", name: "Ocean", mode: "dark", base: "#0c4a6e", mood: "calm" }
] as const;

const ACCENTS = [
  { key: "marigold", rgb: "#f59e0b" },
  { key: "saffron", rgb: "#ea580c" },
  { key: "crimson", rgb: "#dc2626" },
  { key: "rose", rgb: "#e11d48" },
  { key: "violet", rgb: "#7c3aed" },
  { key: "indigo", rgb: "#4f46e5" },
  { key: "emerald", rgb: "#059669" },
  { key: "teal", rgb: "#0d9488" }
];

const GRADIENTS = ["Linear", "Diagonal", "Radial", "Vertical", "Sunrise", "Dusk"];

function buildVars(base: string, accentRgb: string, dark: boolean): Record<string, string> {
  const b = hex(base);
  const a = hex(accentRgb);
  return {
    canvas: css(dark ? mix(b, BLACK, 0.55) : mix(b, WHITE, 0.94)),
    surface: css(dark ? mix(b, BLACK, 0.4) : WHITE),
    line: css(dark ? mix(b, WHITE, 0.18) : mix(b, WHITE, 0.78)),
    "ink-900": css(dark ? mix(WHITE, b, 0.08) : mix(BLACK, b, 0.12)),
    "ink-700": css(dark ? mix(WHITE, b, 0.22) : mix(BLACK, b, 0.3)),
    "ink-500": css(dark ? mix(WHITE, b, 0.42) : mix(BLACK, b, 0.5)),
    "brand-50": css(dark ? mix(a, BLACK, 0.78) : mix(a, WHITE, 0.94)),
    "brand-100": css(dark ? mix(a, BLACK, 0.65) : mix(a, WHITE, 0.86)),
    "brand-500": css(mix(a, WHITE, 0.15)),
    "brand-600": css(a),
    "brand-700": css(mix(a, BLACK, 0.18))
  };
}

export const THEMES: Theme[] = [];
for (const f of FAMILIES) {
  for (const a of ACCENTS) {
    for (const g of GRADIENTS) {
      THEMES.push({
        id: f.key + "-" + a.key + "-" + g.toLowerCase(),
        name: f.name + " " + a.key + " " + g,
        family: f.key,
        mode: f.mode,
        vars: buildVars(f.base, a.rgb, f.mode === "dark")
      });
    }
  }
}
export const THEME_COUNT = THEMES.length;

export const MOOD_TO_FAMILY: Record<string, string> = {
  sad: "noir",
  evergreen: "nature",
  devotion: "devotion",
  festive: "festive",
  calm: "calm",
  energetic: "energy"
};

function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function pickTheme(
  mode: string,
  customId?: string,
  mood?: string | null,
  date: Date = new Date()
): Theme {
  const n = THEMES.length;
  if (mode === "custom" && customId) return THEMES.find((t) => t.id === customId) ?? THEMES[0];
  if (mood) {
    const fam = MOOD_TO_FAMILY[mood];
    const pool = THEMES.filter((t) => t.family === fam);
    if (pool.length) return pool[dayNumber(date) % pool.length];
  }
  if (mode === "monthly") return THEMES[(date.getFullYear() * 12 + date.getMonth()) % n];
  if (mode === "yearly") return THEMES[date.getFullYear() % n];
  return THEMES[dayNumber(date) % n];
}

const toHex = (v: string) => {
  const [r, g, b] = v.split(" ").map(Number);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
};

export type Colors = {
  canvas: string;
  surface: string;
  line: string;
  ink900: string;
  ink700: string;
  ink500: string;
  brand50: string;
  brand100: string;
  brand600: string;
  brand700: string;
  mode: "light" | "dark";
};

export function colorsOf(t: Theme): Colors {
  return {
    canvas: toHex(t.vars.canvas),
    surface: toHex(t.vars.surface),
    line: toHex(t.vars.line),
    ink900: toHex(t.vars["ink-900"]),
    ink700: toHex(t.vars["ink-700"]),
    ink500: toHex(t.vars["ink-500"]),
    brand50: toHex(t.vars["brand-50"]),
    brand100: toHex(t.vars["brand-100"]),
    brand600: toHex(t.vars["brand-600"]),
    brand700: toHex(t.vars["brand-700"]),
    mode: t.mode
  };
}
