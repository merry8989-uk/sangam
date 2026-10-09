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

import httpx

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


def _remote_embed(texts: list[str]) -> dict | None:
    """Ask the ML inference service to embed, if one is configured."""
    if not settings.ml_inference_url:
        return None
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{settings.ml_inference_url.rstrip('/')}/infer/embed", json={"texts": texts}
            )
        data = resp.json() if resp.status_code == 200 else None
        return data if data and "embeddings" in data else None
    except Exception:
        return None


def local_embed(texts: list[str]) -> dict | None:
    """Embed on THIS instance (used by /infer/embed on a GPU worker)."""
    if not settings.embeddings_enabled:
        return None
    try:
        model = _load_model()
        vectors = model.encode(texts, normalize_embeddings=True)
        vecs = [list(map(float, v)) for v in vectors]
        return {"embeddings": vecs, "dim": len(vecs[0]) if vecs else 0,
                "engine": settings.embeddings_model}
    except Exception:
        return None


def embed(texts: list[str]) -> dict:
    remote = _remote_embed(texts)
    if remote is not None:
        return remote
    local = local_embed(texts)
    if local is not None:
        return local
    return {
        "embeddings": [hashing_embed(t) for t in texts],
        "dim": HASH_DIM,
        "engine": "hashing",
    }


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    return sum(x * y for x, y in zip(a, b))
