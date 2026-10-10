"""Video ingestion: probe, transcode to HLS, generate a poster.

Produces an adaptive-bitrate HLS ladder (one playlist per rendition plus a
master playlist) and a poster frame, then stores them beside the original.

FFmpeg and ffprobe are located via settings or PATH. If ffprobe is absent we
fall back to parsing `ffmpeg -i`, so the pipeline works on a bare ffmpeg build.
"""

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from . import s3
from .settings import settings

# (height, target video bitrate in kbps), smallest first.
# Runs from 144p up to 2K (1440p). A source only ever gets the rungs at or
# below its own height, so the top rung is only produced for a 1440p+ upload.
LADDER = [
    (144, 100),
    (240, 300),
    (360, 800),
    (480, 1400),
    (720, 2800),
    (1080, 5000),
    (1440, 10000),
]
SEGMENT_SECONDS = 6
AUDIO_BITRATE = "128k"


class TranscodeError(Exception):
    """Raised when FFmpeg fails or the source is not a usable video."""


def _read(key: str) -> bytes:
    """Fetch the source. Any storage failure becomes a TranscodeError, so the
    API answers with a clean 4xx instead of a 500 and a stack trace."""
    try:
        return s3.get_bytes(key)
    except Exception as exc:
        raise TranscodeError(f"could not read {key}") from exc


def _ffmpeg() -> str:
    return settings.ffmpeg_bin or shutil.which("ffmpeg") or "ffmpeg"


def _ffprobe() -> str | None:
    return settings.ffprobe_bin or shutil.which("ffprobe")


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise TranscodeError(proc.stderr[-2000:] or "ffmpeg failed")
    return proc


def probe(path: Path) -> dict:
    """Return {width, height, duration, has_audio} for a media file."""
    ffprobe = _ffprobe()
    if ffprobe:
        out = _run([ffprobe, "-v", "quiet", "-print_format", "json",
                    "-show_format", "-show_streams", str(path)]).stdout
        data = json.loads(out)
        video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
        if video is None:
            raise TranscodeError("no video stream")
        return {
            "width": int(video["width"]),
            "height": int(video["height"]),
            "duration": float(data["format"].get("duration") or 0.0),
            "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
        }

    # Fallback: parse `ffmpeg -i` (exits non-zero by design with no output file).
    err = subprocess.run([_ffmpeg(), "-i", str(path)], capture_output=True, text=True).stderr
    res = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", err)
    dur = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if not res or not dur:
        raise TranscodeError("could not probe media")
    h, m, s = int(dur.group(1)), int(dur.group(2)), float(dur.group(3))
    return {
        "width": int(res.group(1)),
        "height": int(res.group(2)),
        "duration": h * 3600 + m * 60 + s,
        "has_audio": "Audio:" in err,
    }


def _even(n: float) -> int:
    v = int(round(n))
    return v - (v % 2)


def _profile_args(height: int) -> list[str]:
    """Pick an H.264 profile and level that can actually carry this resolution.

    Level 4.1 tops out at 1080p and 5.2 carries 1440p. The branch above 4K is
    kept so the ladder can be widened again without reintroducing the bug where
    the encoder refuses the frame size.
    """
    if height <= 1080:
        return ["-profile:v", "main", "-level:v", "4.1"]
    if height <= 2160:
        return ["-profile:v", "high", "-level:v", "5.2"]
    return ["-profile:v", "high", "-level:v", "6.2"]


def _rendition(src: Path, outdir: Path, height: int, bitrate_k: int, audio_bitrate: str = AUDIO_BITRATE) -> None:
    d = outdir / f"{height}p"
    d.mkdir(parents=True, exist_ok=True)
    _run([
        _ffmpeg(), "-y", "-i", str(src),
        "-vf", f"scale=-2:{height}",
        "-c:v", "libx264", "-preset", "veryfast", *_profile_args(height),
        "-b:v", f"{bitrate_k}k",
        "-maxrate", f"{int(bitrate_k * 1.07)}k", "-bufsize", f"{bitrate_k * 2}k",
        "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", audio_bitrate, "-ac", "2",
        "-f", "hls", "-hls_time", str(SEGMENT_SECONDS), "-hls_playlist_type", "vod",
        "-hls_segment_filename", str(d / "seg_%03d.ts"),
        str(d / "index.m3u8"),
    ])


def _write_master(outdir: Path, rends: list[tuple[int, int, int]]) -> None:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for height, bitrate_k, out_w in rends:
        lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={bitrate_k * 1000},RESOLUTION={out_w}x{height}")
        lines.append(f"{height}p/index.m3u8")
    (outdir / "master.m3u8").write_text("\n".join(lines) + "\n")


_CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".jpg": "image/jpeg",
    ".mp4": "video/mp4",
}


def transcode_video(key: str, max_height: int | None = None, audio_bitrate: str | None = None) -> dict:
    """Download ``key``, build an HLS ladder + poster, store and describe it."""
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        src = tdp / "src"
        src.write_bytes(_read(key))

        meta = probe(src)
        # An upload quality can cap the ladder so a "low" upload never stores 1080p.
        ladder = [
            r for r in LADDER
            if r[0] <= meta["height"] and (max_height is None or r[0] <= max_height)
        ] or [LADDER[0]]

        outdir = tdp / "out"
        outdir.mkdir()
        rends: list[tuple[int, int, int]] = []
        for height, bitrate_k in ladder:
            _rendition(src, outdir, height, bitrate_k, audio_bitrate or AUDIO_BITRATE)
            out_w = _even(height * meta["width"] / meta["height"])
            rends.append((height, bitrate_k, out_w))
        _write_master(outdir, rends)

        # Poster frame, a little way in (or mid-clip for very short videos).
        seek = min(1.0, meta["duration"] / 2) if meta["duration"] else 0.5
        _run([
            _ffmpeg(), "-y", "-ss", f"{seek:.2f}", "-i", str(src),
            "-frames:v", "1", "-vf", "scale=640:-2", str(outdir / "poster.jpg"),
        ])

        # Short muted preview clip (used for hover previews), ~4s.
        _run([
            _ffmpeg(), "-y", "-ss", f"{seek:.2f}", "-i", str(src), "-t", "4",
            "-vf", "scale=-2:360", "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart",
            str(outdir / "preview.mp4"),
        ])

        prefix = f"{key.rsplit('.', 1)[0]}_hls"
        for f in sorted(outdir.rglob("*")):
            if f.is_file():
                rel = f.relative_to(outdir).as_posix()
                ctype = _CONTENT_TYPES.get(f.suffix, "application/octet-stream")
                s3.put_bytes(f"{prefix}/{rel}", f.read_bytes(), ctype)

        variants = [
            {
                "height": height,
                "width": out_w,
                "bitrateK": bitrate_k,
                "playlistKey": f"{prefix}/{height}p/index.m3u8",
            }
            for height, bitrate_k, out_w in rends
        ]

        return {
            "width": meta["width"],
            "height": meta["height"],
            "durationMs": int(meta["duration"] * 1000),
            "thumbnailKey": f"{prefix}/poster.jpg",
            "hlsKey": f"{prefix}/master.m3u8",
            "previewKey": f"{prefix}/preview.mp4",
            "renditions": [h for h, _, _ in rends],
            "variants": variants,
        }


def _frame_at(src: Path, at_sec: float, out: Path, width: int = 640) -> None:
    _run([
        _ffmpeg(), "-y", "-ss", f"{max(0.0, at_sec):.2f}", "-i", str(src),
        "-frames:v", "1", "-vf", f"scale={width}:-2", str(out),
    ])


def sample_frames(key: str, count: int = 8) -> dict:
    """Extract evenly spaced frames so an author can pick a poster.

    The strip is cached under the media's HLS prefix, so asking again for the
    same count is a single small object read instead of a full re-extract.
    """
    count = max(1, min(int(count), 20))
    prefix = f"{key.rsplit('.', 1)[0]}_hls"
    index_key = f"{prefix}/frames/index.json"

    try:
        cached = json.loads(s3.get_bytes(index_key).decode("utf-8"))
        if cached.get("count") == count and cached.get("frames"):
            return {
                "frames": cached["frames"],
                "durationMs": int(cached.get("durationMs") or 0),
                "cached": True,
            }
    except Exception:
        # No cache yet, or unreadable: fall through and build it.
        pass

    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        src = tdp / "src"
        src.write_bytes(_read(key))
        meta = probe(src)
        duration = float(meta["duration"] or 0)
        prefix = f"{key.rsplit('.', 1)[0]}_hls"

        frames = []
        for i in range(count):
            # Spread across the clip, avoiding the very first and last moments.
            at = duration * (i + 0.5) / count if duration else 0.0
            out = tdp / f"f{i}.jpg"
            _frame_at(src, at, out)
            outkey = f"{prefix}/frames/f{i}.jpg"
            s3.put_bytes(outkey, out.read_bytes(), "image/jpeg")
            frames.append({"atSec": round(at, 2), "key": outkey})

        payload = {"count": count, "durationMs": int(duration * 1000), "frames": frames}
        s3.put_bytes(index_key, json.dumps(payload).encode("utf-8"), "application/json")
        return {"frames": frames, "durationMs": int(duration * 1000), "cached": False}


def extract_poster(key: str, at_sec: float) -> dict:
    """Store a poster frame taken at the requested second."""
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        src = tdp / "src"
        src.write_bytes(_read(key))
        meta = probe(src)
        duration = float(meta["duration"] or 0)
        at = max(0.0, min(float(at_sec), max(0.0, duration - 0.05)))
        prefix = f"{key.rsplit('.', 1)[0]}_hls"

        out = tdp / "poster.jpg"
        _frame_at(src, at, out)
        outkey = f"{prefix}/poster.jpg"
        s3.put_bytes(outkey, out.read_bytes(), "image/jpeg")
        return {"thumbnailKey": outkey, "atSec": round(at, 2)}
