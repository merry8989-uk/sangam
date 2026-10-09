"""Creator-assist agents.

Template-based generators with production-shaped interfaces. No language
model is bundled: each function returns useful output today and is the seam
where an LLM (Indic-capable, for generation and translation) plugs in
without changing callers.

Every agent is a pure function so it is trivially testable and auditable.
"""

import re

STOPWORDS = {
    "the", "and", "for", "with", "this", "that", "from", "your", "you", "are",
    "was", "were", "have", "has", "had", "not", "but", "our", "out", "into",
    "over", "just", "very", "will", "can", "all", "one", "new", "how", "why",
}

_CAPTION_TEMPLATES = {
    "friendly": ["Loving {t} today", "Moments like {t}", "Sharing {t} with you all"],
    "professional": ["An update on {t}", "Notes on {t}", "What we learned about {t}"],
    "excited": ["Cannot wait to show you {t}", "{t} - here we go", "Big news about {t}"],
}


def suggest_hashtags(text: str, limit: int = 8) -> list[str]:
    """Rank words in ``text`` by frequency into hashtags (CJK/Devanagari aware)."""
    words = re.findall(r"[\w\u0900-\u097F]+", text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if len(w) < 3 or w in STOPWORDS or w.isdigit():
            continue
        freq[w] = freq.get(w, 0) + 1
    ranked = sorted(freq, key=lambda w: (-freq[w], w))
    tags = [f"#{w}" for w in ranked[:limit]]
    return tags or ["#sangam"]


def suggest_captions(topic: str, tone: str = "friendly") -> list[str]:
    """Draft caption options for a topic and tone."""
    t = topic.strip() or "this moment"
    templates = _CAPTION_TEMPLATES.get(tone, _CAPTION_TEMPLATES["friendly"])
    return [tpl.format(t=t) for tpl in templates]


def draft_title_description(text: str) -> dict:
    """Split a block of text into a short title and a description."""
    clean = " ".join(text.strip().split())
    title = clean.split(".")[0][:70] or "Untitled"
    return {"title": title, "description": clean[:300]}


def alt_text(hint: str = "") -> str:
    """Produce alt text. A vision model would describe the image; the
    interface is the same."""
    return hint.strip() or "Image shared on Sangam"


def translate(text: str, target: str = "hi-IN") -> dict:
    """Translation seam. Identity stub - replace with a real translation model.

    Returned unchanged so the pipeline is honest about what it did rather
    than inventing a translation.
    """
    return {"text": text, "target": target, "engine": "identity-stub", "translated": False}
