// Optional Meilisearch backend, used through its REST API (no SDK dependency).
// When MEILISEARCH_URL is unset, callers fall back to Postgres `contains`.

const BASE = process.env.MEILISEARCH_URL ?? "";
const KEY = process.env.MEILISEARCH_KEY ?? "";

export function searchEnabled(): boolean {
  return Boolean(BASE);
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
      ...(init.headers ?? {})
    }
  });
}

export type PostDoc = {
  id: string;
  caption: string;
  authorUsername: string;
  hashtags: string[];
  type: string;
  createdAt: number;
};

export type UserDoc = { id: string; username: string; displayName: string };

// Create the indexes and set which fields are searchable. Safe to call often.
export async function ensureIndexes(): Promise<void> {
  if (!searchEnabled()) return;
  for (const [uid, attrs] of [
    ["posts", ["caption", "authorUsername", "hashtags"]],
    ["users", ["username", "displayName"]]
  ] as const) {
    try {
      await req("/indexes", { method: "POST", body: JSON.stringify({ uid, primaryKey: "id" }) });
      await req(`/indexes/${uid}/settings/searchable-attributes`, {
        method: "PUT",
        body: JSON.stringify(attrs)
      });
    } catch {
      /* index may already exist, or Meilisearch is down */
    }
  }
}

export async function indexPosts(docs: PostDoc[]): Promise<void> {
  if (!searchEnabled() || !docs.length) return;
  try {
    await req("/indexes/posts/documents", { method: "PUT", body: JSON.stringify(docs) });
  } catch {
    /* best effort */
  }
}

export async function indexUsers(docs: UserDoc[]): Promise<void> {
  if (!searchEnabled() || !docs.length) return;
  try {
    await req("/indexes/users/documents", { method: "PUT", body: JSON.stringify(docs) });
  } catch {
    /* best effort */
  }
}

export async function removePost(id: string): Promise<void> {
  if (!searchEnabled()) return;
  try {
    await req(`/indexes/posts/documents/${id}`, { method: "DELETE" });
  } catch {
    /* best effort */
  }
}

async function hitIds(index: string, q: string, limit: number): Promise<string[]> {
  try {
    const res = await req(`/indexes/${index}/search`, {
      method: "POST",
      body: JSON.stringify({ q, limit })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits ?? []).map((h: { id: string }) => h.id);
  } catch {
    return [];
  }
}

export function searchPosts(q: string, limit = 20): Promise<string[]> {
  return hitIds("posts", q, limit);
}

export function searchUsers(q: string, limit = 10): Promise<string[]> {
  return hitIds("users", q, limit);
}
