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

# (height, target video bitrate in kbps)
LADDER = [(360, 800), (480, 1400), (720, 2800), (1080, 5000)]
SEGMENT_SECONDS = 6
AUDIO_BITRATE = "128k"


class TranscodeError(Exception):
    """Raised when FFmpeg fails or the source is not a usable video."""


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


def _rendition(src: Path, outdir: Path, height: int, bitrate_k: int) -> None:
    d = outdir / f"{height}p"
    d.mkdir(parents=True, exist_ok=True)
    _run([
        _ffmpeg(), "-y", "-i", str(src),
        "-vf", f"scale=-2:{height}",
        "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main",
        "-b:v", f"{bitrate_k}k",
        "-maxrate", f"{int(bitrate_k * 1.07)}k", "-bufsize", f"{bitrate_k * 2}k",
        "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", AUDIO_BITRATE, "-ac", "2",
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


def transcode_video(key: str) -> dict:
    """Download ``key``, build an HLS ladder + poster, store and describe it."""
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        src = tdp / "src"
        src.write_bytes(s3.get_bytes(key))

        meta = probe(src)
        ladder = [r for r in LADDER if r[0] <= meta["height"]] or [LADDER[0]]

        outdir = tdp / "out"
        outdir.mkdir()
        rends: list[tuple[int, int, int]] = []
        for height, bitrate_k in ladder:
            _rendition(src, outdir, height, bitrate_k)
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

        return {
            "width": meta["width"],
            "height": meta["height"],
            "durationMs": int(meta["duration"] * 1000),
            "thumbnailKey": f"{prefix}/poster.jpg",
            "hlsKey": f"{prefix}/master.m3u8",
            "previewKey": f"{prefix}/preview.mp4",
            "renditions": [h for h, _, _ in rends],
        }
