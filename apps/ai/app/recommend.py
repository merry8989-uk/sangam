"""Recommendation scaffold.

The full system is a multi-stage pipeline: candidate retrieval -> filtering
-> ranking -> diversity. This module implements the shape of that pipeline
with a transparent heuristic ranker so the API contract is real today and
a model can drop in later without changing callers.
"""

from dataclasses import dataclass


@dataclass
class Candidate:
    post_id: str
    engagement: float = 0.0   # likes + comments, normalised
    recency_hours: float = 0.0
    affinity: float = 0.0     # follows / past interactions, normalised


def rank(candidates: list[Candidate], limit: int = 20) -> list[str]:
    def score(c: Candidate) -> float:
        freshness = 1.0 / (1.0 + c.recency_hours)
        return 0.5 * c.affinity + 0.3 * freshness + 0.2 * c.engagement

    ordered = sorted(candidates, key=score, reverse=True)
    return [c.post_id for c in ordered[:limit]]
