"""Content moderation.

Starter implementation: a fast, dependency-free heuristic pass that flags
obvious categories and returns a score. The production path swaps in a
real classifier (e.g. an Indic-capable multilingual text model plus a
vision model for images/video frames) behind the same interface.
"""

from dataclasses import dataclass

# Deliberately small illustrative blocklist. A real deployment loads a
# maintained, multilingual (English + Indian languages) lexicon and runs a
# trained classifier - this keeps the interface honest without pretending
# a keyword list is production moderation.
_BLOCKLIST = {"spam_example", "abuse_example", "scam_example"}


@dataclass
class ModerationResult:
    flagged: bool
    score: float
    categories: list[str]


def moderate_text(text: str) -> ModerationResult:
    lowered = text.lower()
    hits = [w for w in _BLOCKLIST if w in lowered]
    # Simple heuristic score; replace with model probability in production.
    score = min(1.0, 0.2 * len(hits))
    return ModerationResult(flagged=bool(hits), score=score, categories=hits)
