"""Content moderation.

Two layers, combined:

1. A real ML backend (Hugging Face `transformers`) for text and images. It is
   opt-in (`MODERATION_ENABLED=true` plus the extra deps in requirements-ml.txt)
   and loaded lazily on first use.
2. A dependency-free heuristic lexicon that always runs as a floor.

If the model is unavailable for any reason - deps missing, download failed,
inference error - moderation falls back to the heuristic and reports which
engine actually produced the verdict in `engine`.

Default models:
  text:  unitary/multilingual-toxic-xlm-roberta  (XLM-R; multilingual, incl. Indic)
  image: Falconsai/nsfw_image_detection          (ViT image classifier)
"""

import io
import re
import threading

import httpx
from dataclasses import dataclass, field

from .settings import settings

# --------------------------------------------------------------------------
# Shared result type
# --------------------------------------------------------------------------


@dataclass
class ModerationResult:
    flagged: bool
    score: float
    categories: list[str] = field(default_factory=list)
    matches: list[str] = field(default_factory=list)
    engine: str = "heuristic"
    labels: list[dict] = field(default_factory=list)


# --------------------------------------------------------------------------
# Layer 2: heuristic lexicon (always available)
# --------------------------------------------------------------------------

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


def heuristic_text(text: str) -> ModerationResult:
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
        flagged=score >= 0.5, score=round(score, 3), categories=cats,
        matches=matches, engine="heuristic",
    )


# --------------------------------------------------------------------------
# Layer 1: ML backend (lazy, optional)
# --------------------------------------------------------------------------

# A label is treated as a "bad" class unless it reads as an explicitly safe one.
SAFE_LABEL_HINTS = ("non-toxic", "nontoxic", "non_toxic", "neutral", "safe", "normal", "clean", "not_")
BAD_LABEL_HINTS = (
    "toxic", "hate", "abuse", "threat", "obscene", "insult", "identity",
    "harass", "violent", "nsfw", "severe", "profan",
)

_text_pipe = None
_image_pipe = None
_pipe_lock = threading.Lock()


def _is_bad_label(label: str) -> bool:
    low = label.lower()
    if any(s in low for s in SAFE_LABEL_HINTS):
        return False
    return any(b in low for b in BAD_LABEL_HINTS)


def _load_text_pipe():
    global _text_pipe
    if _text_pipe is None:
        with _pipe_lock:
            if _text_pipe is None:
                from transformers import pipeline  # imported only when enabled

                _text_pipe = pipeline(
                    "text-classification",
                    model=settings.moderation_text_model,
                    top_k=None,
                    truncation=True,
                )
    return _text_pipe


def _load_image_pipe():
    global _image_pipe
    if _image_pipe is None:
        with _pipe_lock:
            if _image_pipe is None:
                from transformers import pipeline

                _image_pipe = pipeline(
                    "image-classification",
                    model=settings.moderation_image_model,
                )
    return _image_pipe


def _rows(raw) -> list[dict]:
    """Normalise pipeline output to a flat list of {label, score}."""
    if raw and isinstance(raw[0], list):
        raw = raw[0]
    return [{"label": str(r.get("label", "")), "score": round(float(r.get("score", 0.0)), 3)} for r in raw]


def _remote(path: str, payload: dict) -> dict | None:
    """POST to the ML inference service, if one is configured."""
    if not settings.ml_inference_url:
        return None
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(f"{settings.ml_inference_url.rstrip('/')}{path}", json=payload)
        return resp.json() if resp.status_code == 200 else None
    except Exception:
        return None


def local_text(text: str) -> ModerationResult | None:
    """Run the model on THIS instance (used by /infer/text on a GPU worker)."""
    if not settings.moderation_enabled:
        return None
    try:
        pipe = _load_text_pipe()
        rows = _rows(pipe(text[:4000]))
    except Exception:
        return None

    cats = [r["label"].lower() for r in rows
            if _is_bad_label(r["label"]) and r["score"] >= settings.moderation_text_threshold]
    score = max([r["score"] for r in rows if _is_bad_label(r["label"])] or [0.0])
    return ModerationResult(
        flagged=bool(cats), score=round(score, 3), categories=cats,
        matches=[], engine=settings.moderation_text_model, labels=rows,
    )


def model_text(text: str) -> ModerationResult | None:
    """Remote inference if configured, else the local model, else None."""
    remote = _remote("/infer/text", {"text": text[:4000]})
    if remote is not None:
        return ModerationResult(
            flagged=bool(remote.get("flagged")),
            score=float(remote.get("score", 0.0)),
            categories=list(remote.get("categories", [])),
            matches=[],
            engine=str(remote.get("engine", "remote")),
            labels=list(remote.get("labels", [])),
        )
    return local_text(text)


def model_image(data: bytes) -> ModerationResult | None:
    """Run the ML image classifier, or return None if it is unavailable."""
    if not settings.moderation_enabled:
        return None
    try:
        from PIL import Image

        pipe = _load_image_pipe()
        image = Image.open(io.BytesIO(data)).convert("RGB")
        rows = _rows(pipe(image))
    except Exception:
        return None

    cats = [r["label"].lower() for r in rows
            if _is_bad_label(r["label"]) and r["score"] >= settings.moderation_image_threshold]
    score = max([r["score"] for r in rows if _is_bad_label(r["label"])] or [0.0])
    return ModerationResult(
        flagged=bool(cats), score=round(score, 3), categories=cats,
        matches=[], engine=settings.moderation_image_model, labels=rows,
    )


# --------------------------------------------------------------------------
# Public API - combine model + heuristic
# --------------------------------------------------------------------------


def _combine(a: ModerationResult, b: ModerationResult) -> ModerationResult:
    cats = list(dict.fromkeys(a.categories + b.categories))
    return ModerationResult(
        flagged=a.flagged or b.flagged,
        score=max(a.score, b.score),
        categories=cats,
        matches=a.matches + b.matches,
        engine=f"{b.engine}+{a.engine}" if b.engine != a.engine else a.engine,
        labels=b.labels or a.labels,
    )


def moderate_text(text: str) -> ModerationResult:
    heuristic = heuristic_text(text)
    model = model_text(text)
    return heuristic if model is None else _combine(heuristic, model)


def moderate_image_bytes(data: bytes) -> ModerationResult:
    model = model_image(data)
    if model is not None:
        return model
    # No image model available: a conservative default (do not block).
    return ModerationResult(flagged=False, score=0.0, engine="none")
