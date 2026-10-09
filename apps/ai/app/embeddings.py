"""Text embeddings for knowledge-base retrieval.

Two backends:

1. `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` when
   `EMBEDDINGS_ENABLED=true` and sentence-transformers is installed. This is a
   multilingual model, so Indian-language knowledge bases embed sensibly.
2. A dependency-free lexical hashing embedding otherwise. It captures token
   overlap (good enough for keyword-ish retrieval) and always works, so the
   feature is usable without any ML install.

Both return L2-normalised vectors, so cosine similarity is a plain dot product.
"""

import hashlib
import math
import re
import threading

from .settings import settings

HASH_DIM = 256
_TOKEN = re.compile(r"[\w\u0900-\u097F]+")

_model = None
_model_lock = threading.Lock()


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def hashing_embed(text: str) -> list[float]:
    """Deterministic bag-of-words hashing embedding (no dependencies)."""
    vec = [0.0] * HASH_DIM
    for token in _tokenize(text):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        vec[int.from_bytes(digest, "big") % HASH_DIM] += 1.0
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm else vec


def _load_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(settings.embeddings_model)
    return _model


def _model_embed(texts: list[str]) -> list[list[float]] | None:
    if not settings.embeddings_enabled:
        return None
    try:
        model = _load_model()
        vectors = model.encode(texts, normalize_embeddings=True)
        return [list(map(float, v)) for v in vectors]
    except Exception:
        return None


def embed(texts: list[str]) -> dict:
    vectors = _model_embed(texts)
    if vectors is not None:
        return {
            "embeddings": vectors,
            "dim": len(vectors[0]) if vectors else 0,
            "engine": settings.embeddings_model,
        }
    return {
        "embeddings": [hashing_embed(t) for t in texts],
        "dim": HASH_DIM,
        "engine": "hashing",
    }


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    return sum(x * y for x, y in zip(a, b))
