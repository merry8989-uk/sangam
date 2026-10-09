import { FAMILIES, THEMES, THEME_COUNT } from "@/lib/themes";

export const dynamic = "force-static";

// Gallery of every generated theme, grouped by family. Each swatch is the
// theme's accent colour; hover shows the full name.
export default function ThemesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Themes</h1>
      <p className="mb-6 text-sm text-ink-500">
        {THEME_COUNT} combinations - {FAMILIES.length} families x 8 accents x 6 gradients. The active
        theme rotates by day, week, month or year, or follows your mood (Settings &rarr; Theme).
      </p>

      <div className="space-y-6">
        {FAMILIES.map((f) => {
          const themes = THEMES.filter((t) => t.family === f.key);
          return (
            <section key={f.key}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-semibold">{f.name}</h2>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  {f.mode}
                </span>
                <span className="text-xs text-ink-500">mood: {f.mood} · {themes.length} themes</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {themes.map((t) => (
                  <span
                    key={t.id}
                    title={t.name}
                    className="h-6 w-6 rounded border border-slate-200"
                    style={{ backgroundColor: "rgb(" + t.vars["brand-600"] + ")" }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
