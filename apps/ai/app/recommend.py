"""Multi-stage recommendation pipeline.

Stages, in order:
  1. retrieval  - union candidates from several sources (following, trending, similar)
  2. filtering  - drop already-seen posts and blocked authors
  3. ranking    - score by affinity, freshness and engagement
  4. diversity  - cap items per author so a single voice cannot dominate the page

Content-based retrieval uses cosine similarity over embeddings. The ranker is
a transparent linear model so a learned model can replace it without changing
callers.
"""

import math
from dataclasses import dataclass

DEFAULT_WEIGHTS = {"affinity": 0.5, "freshness": 0.3, "engagement": 0.2}


@dataclass
class Candidate:
    post_id: str
    author_id: str = ""
    engagement: float = 0.0
    recency_hours: float = 0.0
    affinity: float = 0.0
    embedding: list[float] | None = None


def retrieve(sources: dict[str, list[Candidate]], limit_per_source: int = 200) -> list[Candidate]:
    """Union candidates from every source, de-duplicated by post id."""
    seen: set[str] = set()
    out: list[Candidate] = []
    for items in sources.values():
        for c in items[:limit_per_source]:
            if c.post_id not in seen:
                seen.add(c.post_id)
                out.append(c)
    return out


def filter_candidates(cands, seen_ids=(), blocked_authors=()) -> list[Candidate]:
    s, b = set(seen_ids), set(blocked_authors)
    return [c for c in cands if c.post_id not in s and c.author_id not in b]


def _score(c: Candidate, w: dict) -> float:
    freshness = 1.0 / (1.0 + max(c.recency_hours, 0.0))
    return w["affinity"] * c.affinity + w["freshness"] * freshness + w["engagement"] * c.engagement


def rank(cands: list[Candidate], weights: dict | None = None) -> list[Candidate]:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    return sorted(cands, key=lambda c: _score(c, w), reverse=True)


def diversify(ranked: list[Candidate], limit: int = 20, max_per_author: int = 3) -> list[str]:
    counts: dict[str, int] = {}
    out: list[str] = []
    for c in ranked:
        if counts.get(c.author_id, 0) >= max_per_author:
            continue
        counts[c.author_id] = counts.get(c.author_id, 0) + 1
        out.append(c.post_id)
        if len(out) >= limit:
            break
    return out


def recommend(
    sources: dict[str, list[Candidate]],
    seen_ids=(),
    blocked_authors=(),
    limit: int = 20,
    max_per_author: int = 3,
    weights: dict | None = None,
) -> list[str]:
    """Run the full pipeline and return an ordered list of post ids."""
    cands = retrieve(sources)
    cands = filter_candidates(cands, seen_ids, blocked_authors)
    ranked = rank(cands, weights)
    return diversify(ranked, limit, max_per_author)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def similar(query: list[float], pool: list[tuple[str, list[float]]], limit: int = 10) -> list[str]:
    """Content-based retrieval: top post ids by cosine similarity to ``query``."""
    scored = [(pid, cosine(query, emb)) for pid, emb in pool]
    scored.sort(key=lambda t: t[1], reverse=True)
    return [pid for pid, _ in scored[:limit]]
