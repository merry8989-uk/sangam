"""Image ingestion: validate, read dimensions, generate thumbnails.

Produces WebP thumbnails at a small ladder of widths and stores them next
to the original. Video transcoding (FFmpeg -> HLS) is the Phase 2 analogue
of this module and will expose the same shape of result.
"""

import io

from PIL import Image, UnidentifiedImageError

from . import s3

THUMB_WIDTHS = [320, 640, 1080]
WEBP_QUALITY = 82


class InvalidImage(Exception):
    """Raised when the object is not a decodable image."""


def process_image(key: str) -> dict:
    """Download ``key``, generate thumbnails, return dimensions + thumb keys."""
    raw = s3.get_bytes(key)
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:  # not an image
        raise InvalidImage(str(exc)) from exc

    width, height = img.size
    base = key.rsplit(".", 1)[0]

    thumbs: dict[str, str] = {}
    for size in THUMB_WIDTHS:
        copy = img.copy()
        copy.thumbnail((size, size))
        buf = io.BytesIO()
        copy.convert("RGB").save(buf, format="WEBP", quality=WEBP_QUALITY)
        thumb_key = f"{base}_w{size}.webp"
        s3.put_bytes(thumb_key, buf.getvalue(), "image/webp")
        thumbs[str(size)] = thumb_key

    return {
        "width": width,
        "height": height,
        "thumbnailKey": thumbs["640"],
        "thumbs": thumbs,
    }
