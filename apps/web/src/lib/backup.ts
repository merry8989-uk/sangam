// Backup scheduling and manifest shape. Everything here is pure so the
// schedule can be reasoned about and tested without a database.

export const BACKUP_FREQUENCIES = ["daily", "weekly", "monthly", "halfyearly", "yearly"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export const BACKUP_PROVIDERS = ["ZOHO", "GOOGLE", "TERABOX"] as const;
export type BackupProvider = (typeof BACKUP_PROVIDERS)[number];

export const BACKUP_SECTIONS = ["chats", "search", "watch"] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBackupFrequency(value: unknown): value is BackupFrequency {
  return typeof value === "string" && (BACKUP_FREQUENCIES as readonly string[]).includes(value);
}

export function isBackupProvider(value: unknown): value is BackupProvider {
  return typeof value === "string" && (BACKUP_PROVIDERS as readonly string[]).includes(value);
}

// Terabox is link-only: there is no supported way to write a file into it, so
// it cannot be a backup target. Google and Zoho both can.
export function providerCanReceive(provider: string): boolean {
  return provider === "ZOHO" || provider === "GOOGLE";
}

// Adding months has to clamp: 31 Jan + 1 month is 28 Feb, not 3 March.
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function nextRunAt(frequency: string, from: Date): Date {
  switch (frequency) {
    case "daily":
      return new Date(from.getTime() + DAY_MS);
    case "weekly":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "monthly":
      return addMonths(from, 1);
    case "halfyearly":
      return addMonths(from, 6);
    case "yearly":
      return addMonths(from, 12);
    default:
      return new Date(from.getTime() + 7 * DAY_MS);
  }
}

// A backup is due when it has never run, or the next slot has arrived.
export function isDue(frequency: string, lastRunAt: Date | null | undefined, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() >= nextRunAt(frequency, lastRunAt).getTime();
}

// ISO week number, so a weekly label is unambiguous across year boundaries.
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year: d.getUTCFullYear(), week };
}

// A stable name for the period this backup covers, used in the filename.
export function periodLabel(frequency: string, date: Date): string {
  const y = date.getUTCFullYear();
  switch (frequency) {
    case "daily":
      return date.toISOString().slice(0, 10);
    case "weekly": {
      const { year, week } = isoWeek(date);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    case "monthly":
      return `${y}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    case "halfyearly":
      return `${y}-H${date.getUTCMonth() < 6 ? 1 : 2}`;
    case "yearly":
      return String(y);
    default:
      return date.toISOString().slice(0, 10);
  }
}

export function backupFileName(frequency: string, date: Date): string {
  return `sangam-backup-${periodLabel(frequency, date)}.json`;
}

// Which sections the user asked to include.
export function includedSections(settings: {
  backupChats?: boolean | null;
  backupSearchHistory?: boolean | null;
  backupWatchHistory?: boolean | null;
}): BackupSection[] {
  const out: BackupSection[] = [];
  if (settings.backupChats) out.push("chats");
  if (settings.backupSearchHistory) out.push("search");
  if (settings.backupWatchHistory) out.push("watch");
  return out;
}

export type BackupManifest = {
  version: number;
  app: string;
  userId: string;
  generatedAt: string;
  frequency: string;
  period: string;
  sections: BackupSection[];
  counts: Record<string, number>;
  data: {
    chats?: { title: string; updatedAt: string; messages: { role: string; content: string; createdAt: string }[] }[];
    search?: { query: string; createdAt: string }[];
    watch?: { postId: string; viewedAt: string }[];
  };
};

// The document we upload. Plain JSON, so it can be read without us.
export function buildManifest(input: {
  userId: string;
  frequency: string;
  now: Date;
  settings: { backupChats?: boolean | null; backupSearchHistory?: boolean | null; backupWatchHistory?: boolean | null };
  chats?: { title: string; updatedAt: Date; messages: { role: string; content: string; createdAt: Date }[] }[];
  search?: { query: string; createdAt: Date }[];
  watch?: { postId: string; viewedAt: Date }[];
}): BackupManifest {
  const sections = includedSections(input.settings);
  const data: BackupManifest["data"] = {};
  const counts: Record<string, number> = {};

  if (sections.includes("chats")) {
    const chats = input.chats ?? [];
    data.chats = chats.map((c) => ({
      title: c.title,
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt.toISOString() }))
    }));
    counts.chats = chats.length;
    counts.chatMessages = chats.reduce((n, c) => n + c.messages.length, 0);
  }

  if (sections.includes("search")) {
    const search = input.search ?? [];
    data.search = search.map((s) => ({ query: s.query, createdAt: s.createdAt.toISOString() }));
    counts.search = search.length;
  }

  if (sections.includes("watch")) {
    const watch = input.watch ?? [];
    data.watch = watch.map((w) => ({ postId: w.postId, viewedAt: w.viewedAt.toISOString() }));
    counts.watch = watch.length;
  }

  return {
    version: 1,
    app: "Sangam",
    userId: input.userId,
    generatedAt: input.now.toISOString(),
    frequency: input.frequency,
    period: periodLabel(input.frequency, input.now),
    sections,
    counts,
    data
  };
}
