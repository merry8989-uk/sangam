// Theme engine.
//
// A theme is a set of CSS variables (colours) applied to :root. The catalog is
// generated combinatorially: 10 families x 8 accents x 6 gradients = 480
// themes. Families carry a mood, so content can drive the theme.
export type ThemeMode = "system" | "daily" | "weekly" | "monthly" | "yearly" | "mood" | "custom";

export type Theme = {
  id: string;
  name: string;
  family: string;
  familyName: string;
  mode: "light" | "dark";
  accent: string;
  gradient: string;
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

type Family = { key: string; name: string; mode: "light" | "dark"; base: string; mood: string };

export const FAMILIES: Family[] = [
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
];

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

function buildVars(fam: Family, accentRgb: string): Record<string, string> {
  const base = hex(fam.base);
  const acc = hex(accentRgb);
  const dark = fam.mode === "dark";

  const canvas = dark ? mix(base, BLACK, 0.55) : mix(base, WHITE, 0.94);
  const surface = dark ? mix(base, BLACK, 0.4) : WHITE;
  const line = dark ? mix(base, WHITE, 0.18) : mix(base, WHITE, 0.78);
  const ink900 = dark ? mix(WHITE, base, 0.08) : mix(BLACK, base, 0.12);
  const ink700 = dark ? mix(WHITE, base, 0.22) : mix(BLACK, base, 0.3);
  const ink500 = dark ? mix(WHITE, base, 0.42) : mix(BLACK, base, 0.5);

  return {
    canvas: css(canvas),
    surface: css(surface),
    line: css(line),
    "ink-900": css(ink900),
    "ink-700": css(ink700),
    "ink-500": css(ink500),
    "brand-50": css(dark ? mix(acc, BLACK, 0.78) : mix(acc, WHITE, 0.94)),
    "brand-100": css(dark ? mix(acc, BLACK, 0.65) : mix(acc, WHITE, 0.86)),
    "brand-500": css(mix(acc, WHITE, 0.15)),
    "brand-600": css(acc),
    "brand-700": css(mix(acc, BLACK, 0.18))
  };
}

export const THEMES: Theme[] = [];
for (const fam of FAMILIES) {
  for (const acc of ACCENTS) {
    for (const grad of GRADIENTS) {
      THEMES.push({
        id: fam.key + "-" + acc.key + "-" + grad.toLowerCase(),
        name: fam.name + " " + acc.key + " " + grad,
        family: fam.key,
        familyName: fam.name,
        mode: fam.mode,
        accent: acc.key,
        gradient: grad,
        vars: buildVars(fam, acc.rgb)
      });
    }
  }
}
export const THEME_COUNT = THEMES.length;

// ---------------------------------------------------------------- mood
export const MOOD_TO_FAMILY: Record<string, string> = {
  sad: "noir",
  evergreen: "nature",
  devotion: "devotion",
  festive: "festive",
  calm: "calm",
  energetic: "energy"
};

const MOOD_WORDS: Record<string, string[]> = {
  sad: ["sad", "heartbreak", "alone", "lonely", "cry", "breakup", "miss", "emotional", "dukhi", "udaas", "tanha", "broken", "tears", "depressed", "lost"],
  devotion: ["bhajan", "devotional", "bhakti", "mandir", "temple", "puja", "pooja", "aarti", "mantra", "shiva", "krishna", "ram", "hanuman", "durga", "allah", "waheguru", "gurbani", "spiritual", "kirtan", "chalisa"],
  evergreen: ["evergreen", "classic", "retro", "purani", "oldsongs", "nature", "mountain", "rain", "forest", "sunset", "beach", "garden", "tree", "pahad", "nadi"],
  festive: ["festival", "diwali", "holi", "wedding", "shaadi", "celebration", "pongal", "onam", "navratri", "eid", "christmas", "birthday"],
  calm: ["lofi", "study", "relax", "sleep", "calm", "peace", "meditation", "quiet", "ambient"],
  energetic: ["workout", "gym", "dance", "energy", "beat", "fitness", "bhangra", "dhol", "run"]
};

// Detect the dominant mood in a blob of text (caption + hashtags).
export function detectMood(text: string): string | null {
  const t = " " + text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F ]+/g, " ").replace(/\s+/g, " ") + " ";
  let best: string | null = null;
  let bestScore = 0;
  for (const [mood, words] of Object.entries(MOOD_WORDS)) {
    let score = 0;
    for (const w of words) if (t.includes(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = mood;
    }
  }
  return bestScore > 0 ? best : null;
}

// ---------------------------------------------------------------- rotation
function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Pick the theme for a user. Deterministic for a given (mode, date), so every
// visit on the same day shows the same theme.
export function pickTheme(opts: {
  mode?: string;
  customId?: string;
  mood?: string | null;
  date?: Date;
}): Theme {
  const date = opts.date ?? new Date();
  const mode = (opts.mode ?? "daily") as ThemeMode;
  const n = THEMES.length;

  if (mode === "custom" && opts.customId) {
    return THEMES.find((t) => t.id === opts.customId) ?? THEMES[0];
  }

  // Mood-driven: stay inside the family for the detected mood.
  if (opts.mood) {
    const fam = MOOD_TO_FAMILY[opts.mood];
    const pool = THEMES.filter((t) => t.family === fam);
    if (pool.length) return pool[dayNumber(date) % pool.length];
  }

  if (mode === "weekly") {
    // A week has its own palette; each day of the week steps through it.
    return THEMES[(isoWeek(date) * 7 + date.getUTCDay()) % n];
  }
  if (mode === "monthly") {
    return THEMES[(date.getUTCFullYear() * 12 + date.getUTCMonth()) % n];
  }
  if (mode === "yearly") {
    return THEMES[date.getUTCFullYear() % n];
  }
  return THEMES[dayNumber(date) % n]; // daily
}

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
