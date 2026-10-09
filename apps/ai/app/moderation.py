"""Multilingual content moderation.

Heuristic, dependency-free starter: normalise the text (case, leetspeak,
repeated characters, zero-width characters), then match against a small
multilingual lexicon (English plus Hindi - Devanagari and romanised)
organised by category. Returns a score, the matched categories and the
specific terms.

This is a safety floor, not a classifier. The ``classifier`` hook lets a
trained model (an Indic-capable text model) replace ``moderate_text``
without changing callers. Slur lists are maintained privately and are
represented here by placeholders only.
"""

import re
from dataclasses import dataclass, field

CATEGORY_WEIGHTS = {"hate": 1.0, "violence": 0.9, "scam": 0.8, "abuse": 0.7, "spam": 0.5}

LEXICON: dict[str, list[str]] = {
    "spam": [
        "free followers", "click here", "buy now", "dm me", "whatsapp me",
        "earn money fast", "work from home", "subscribe my channel",
    ],
    "scam": [
        "you have won", "lottery", "prize money", "crypto giveaway",
        "double your money", "guaranteed returns", "investment guaranteed",
    ],
    "abuse": [
        "idiot", "stupid", "moron", "gadha", "bewakoof", "kamina", "harami",
        "बेवकूफ", "गधा", "कमीना", "हरामी",
    ],
    "hate": ["hate_slur_example"],  # placeholders; real lists are private
    "violence": ["kill you", "will shoot", "bomb the", "stab you"],
}

_LEET = str.maketrans({"@": "a", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "$": "s"})


def normalize(text: str) -> str:
    t = text.lower().translate(_LEET)
    t = re.sub(r"(.)\1{2,}", r"\1", t)                 # collapse 3+ repeats
    t = re.sub(r"[\u200b-\u200d\ufeff]", "", t)        # strip zero-width
    return t


@dataclass
class ModerationResult:
    flagged: bool
    score: float
    categories: list[str] = field(default_factory=list)
    matches: list[str] = field(default_factory=list)


def moderate_text(text: str) -> ModerationResult:
    n = normalize(text)
    cats: list[str] = []
    matches: list[str] = []
    score = 0.0
    for category, terms in LEXICON.items():
        for term in terms:
            if normalize(term) in n:
                if category not in cats:
                    cats.append(category)
                matches.append(term)
                score = max(score, CATEGORY_WEIGHTS[category])
    score = min(1.0, score + 0.1 * max(0, len(matches) - 1))
    return ModerationResult(
        flagged=score >= 0.5, score=round(score, 3), categories=cats, matches=matches
    )
