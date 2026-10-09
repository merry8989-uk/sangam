// Reading a backup back in. The file has been sitting in a cloud drive, so it
// is untrusted: it may be corrupt, hand-edited, or far larger than we expect.
// Everything here validates before it touches the database.

export const SUPPORTED_MANIFEST_VERSION = 1;

// Hard caps, so a hostile file cannot flood the account.
export const RESTORE_LIMITS = {
  maxChats: 2000,
  maxMessagesPerChat: 2000,
  maxSearch: 20000,
  maxWatch: 20000,
  maxTextChars: 100_000,
  maxTitleChars: 300
} as const;

export type ParsedChat = {
  title: string;
  updatedAt: string;
  messages: { role: string; content: string; createdAt: string }[];
};
export type ParsedSearch = { query: string; createdAt: string };
export type ParsedWatch = { postId: string; viewedAt: string };

export type ParsedManifest = {
  version: number;
  period: string;
  generatedAt: string;
  sections: string[];
  chats: ParsedChat[];
  search: ParsedSearch[];
  watch: ParsedWatch[];
};

export type ParseResult =
  | { ok: true; manifest: ParsedManifest; dropped: Record<string, number>; truncated: string[] }
  | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// An ISO date string we can actually use. Anything else is rejected.
function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function clipText(v: unknown, max: number): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return v.slice(0, max);
}

export function parseManifest(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isObj(raw)) return { ok: false, error: "That file is not a Sangam backup." };

  const version = Number(raw.version);
  if (!Number.isFinite(version)) return { ok: false, error: "The backup has no version." };
  if (version > SUPPORTED_MANIFEST_VERSION) {
    return { ok: false, error: `This backup was written by a newer version (v${version}).` };
  }

  const data = isObj(raw.data) ? raw.data : {};
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter((s): s is string => typeof s === "string")
    : [];

  const dropped: Record<string, number> = {};
  const truncated: string[] = [];

  // ---- chats ----
  const chats: ParsedChat[] = [];
  const rawChats = Array.isArray(data.chats) ? data.chats : [];
  if (rawChats.length > RESTORE_LIMITS.maxChats) truncated.push("chats");
  for (const c of rawChats.slice(0, RESTORE_LIMITS.maxChats)) {
    if (!isObj(c)) { dropped.chats = (dropped.chats ?? 0) + 1; continue; }
    const title = clipText(c.title, RESTORE_LIMITS.maxTitleChars) ?? "Restored chat";
    const updatedAt = isoOrNull(c.updatedAt);
    if (!updatedAt) { dropped.chats = (dropped.chats ?? 0) + 1; continue; }

    const rawMsgs = Array.isArray(c.messages) ? c.messages : [];
    if (rawMsgs.length > RESTORE_LIMITS.maxMessagesPerChat) truncated.push("chat messages");
    const messages: ParsedChat["messages"] = [];
    for (const m of rawMsgs.slice(0, RESTORE_LIMITS.maxMessagesPerChat)) {
      if (!isObj(m)) { dropped.messages = (dropped.messages ?? 0) + 1; continue; }
      const role = m.role === "assistant" || m.role === "system" ? m.role : "user";
      const content = clipText(m.content, RESTORE_LIMITS.maxTextChars);
      const createdAt = isoOrNull(m.createdAt);
      if (!content || !createdAt) { dropped.messages = (dropped.messages ?? 0) + 1; continue; }
      messages.push({ role, content, createdAt });
    }
    chats.push({ title, updatedAt, messages });
  }

  // ---- search history ----
  const search: ParsedSearch[] = [];
  const rawSearch = Array.isArray(data.search) ? data.search : [];
  if (rawSearch.length > RESTORE_LIMITS.maxSearch) truncated.push("searches");
  for (const s of rawSearch.slice(0, RESTORE_LIMITS.maxSearch)) {
    if (!isObj(s)) { dropped.search = (dropped.search ?? 0) + 1; continue; }
    const query = clipText(s.query, RESTORE_LIMITS.maxTextChars);
    const createdAt = isoOrNull(s.createdAt);
    if (!query || !createdAt) { dropped.search = (dropped.search ?? 0) + 1; continue; }
    search.push({ query, createdAt });
  }

  // ---- watch history ----
  const watch: ParsedWatch[] = [];
  const rawWatch = Array.isArray(data.watch) ? data.watch : [];
  if (rawWatch.length > RESTORE_LIMITS.maxWatch) truncated.push("watched items");
  for (const w of rawWatch.slice(0, RESTORE_LIMITS.maxWatch)) {
    if (!isObj(w)) { dropped.watch = (dropped.watch ?? 0) + 1; continue; }
    const postId = clipText(w.postId, 100);
    const viewedAt = isoOrNull(w.viewedAt);
    if (!postId || !viewedAt) { dropped.watch = (dropped.watch ?? 0) + 1; continue; }
    watch.push({ postId, viewedAt });
  }

  return {
    ok: true,
    manifest: {
      version,
      period: typeof raw.period === "string" ? raw.period : "",
      generatedAt: isoOrNull(raw.generatedAt) ?? "",
      sections,
      chats,
      search,
      watch
    },
    dropped,
    truncated
  };
}

// What a restore would bring in, without doing it.
export function summarise(manifest: ParsedManifest): {
  chats: number;
  chatMessages: number;
  search: number;
  watch: number;
} {
  return {
    chats: manifest.chats.length,
    chatMessages: manifest.chats.reduce((n, c) => n + c.messages.length, 0),
    search: manifest.search.length,
    watch: manifest.watch.length
  };
}

// A stable key for de-duplicating a chat: the same title saved at the same
// moment is the same chat.
export function chatDedupeKey(title: string, updatedAt: string): string {
  return `${title}::${updatedAt}`;
}

// Same idea for a search entry.
export function searchDedupeKey(query: string, createdAt: string): string {
  return `${query}::${createdAt}`;
}
