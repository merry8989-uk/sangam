"""Image moderation.

Fetches the object and runs it through the ML image classifier (see
moderation.py). With the model disabled or unavailable, it returns a
conservative "not flagged" so the pipeline still runs.
"""

from . import s3
from .moderation import ModerationResult, moderate_image_bytes


def classify_image(key: str) -> ModerationResult:
    return moderate_image_bytes(s3.get_bytes(key))
