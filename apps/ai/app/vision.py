"""Image moderation interface.

No vision model is bundled. ``classify_image`` returns a conservative
"not flagged" result so the pipeline runs end to end, and defines the
contract a real classifier must satisfy. Plug an NSFW / safety classifier
in here before relying on this for production trust and safety.
"""

from . import s3
from .moderation import ModerationResult


def classify_image(key: str) -> ModerationResult:
    """Fetch the object (proving it is reachable) and return a safe default."""
    s3.get_bytes(key)
    return ModerationResult(flagged=False, score=0.0, categories=[], matches=[])
