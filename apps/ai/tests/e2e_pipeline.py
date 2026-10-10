"""End-to-end run of the media pipeline.

Builds a real source clip with FFmpeg, swaps object storage for an in-memory
dict, then drives the actual FastAPI app through TestClient. It exercises the
same code paths the service uses in production: the ladder, the HLS output, the
thumbnail strip and the poster.

Run it with:

    pip install fastapi httpx python-multipart pydantic-settings imageio-ffmpeg
    python tests/e2e_pipeline.py

FFmpeg is located via FFMPEG_BIN, or imageio-ffmpeg, or PATH. If none is found
the script says so instead of failing halfway.

Note on verification: some static FFmpeg builds crash on the MPEG-TS demuxer.
That is the tool, not the output, so the transport stream is checked
structurally (the 188-byte packet sync bytes) rather than by decoding it back.
Point FFMPEG_BIN at a build that can read TS if you also want a decode pass.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))


def find_ffmpeg() -> str | None:
    if os.environ.get("FFMPEG_BIN"):
        return os.environ["FFMPEG_BIN"]
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        import shutil

        return shutil.which("ffmpeg")


def main() -> int:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("No FFmpeg found. Set FFMPEG_BIN or install imageio-ffmpeg.")
        return 2

    os.environ.setdefault("FFMPEG_BIN", ffmpeg)
    os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")

    # object storage becomes a dict, so nothing leaves this process
    import app.s3 as s3

    store: dict[str, bytes] = {}

    class _NotFound(Exception):
        pass

    def get_bytes(key):
        if key not in store:
            raise _NotFound(key)  # stands in for boto3's NoSuchKey
        return store[key]

    s3.get_bytes = get_bytes
    s3.put_bytes = lambda key, data, content_type: store.__setitem__(key, data)
    s3.exists = lambda key: key in store

    from fastapi.testclient import TestClient
    from app.main import app

    checks: list[bool] = []

    def check(label, ok):
        checks.append(bool(ok))
        print(("PASS" if ok else "FAIL"), "|", label)

    with tempfile.TemporaryDirectory() as td:
        source = Path(td) / "source_1440.mp4"
        print("building a 1440p test clip...")
        subprocess.run(
            [
                ffmpeg, "-y", "-v", "error", "-f", "lavfi",
                "-i", "testsrc2=size=2560x1440:rate=24:duration=3",
                "-pix_fmt", "yuv420p", "-c:v", "libx264",
                "-preset", "ultrafast", "-crf", "28", str(source),
            ],
            check=True,
        )
        store["uploads/clip_1440.mp4"] = source.read_bytes()
        print("source:", len(store["uploads/clip_1440.mp4"]), "bytes")

        client = TestClient(app)

        r = client.get("/health")
        check("/health answers", r.status_code == 200)

        print("transcoding over HTTP (this is the real encode)...")
        r = client.post("/process/video", json={"key": "uploads/clip_1440.mp4"})
        check("/process/video answers 200", r.status_code == 200)
        body = r.json()
        check("renditions are 144p..2K", body.get("renditions") == [144, 240, 360, 480, 720, 1080, 1440])
        check("seven variants", len(body.get("variants", [])) == 7)
        check("master playlist returned", str(body.get("hlsKey", "")).endswith("/master.m3u8"))
        check("poster produced", body.get("thumbnailKey") in store)
        check("preview clip produced", body.get("previewKey") in store)

        # the transport stream must be structurally sound
        for v in body.get("variants", []):
            key = v["playlistKey"].rsplit("/", 1)[0] + "/seg_000.ts"
            if key not in store:
                check("%dp segment stored" % v["height"], False)
                continue
            data = store[key]
            packets = len(data) // 188
            syncs = sum(1 for i in range(0, packets * 188, 188) if data[i] == 0x47)
            check("%dp segment is a valid TS stream" % v["height"], packets > 0 and syncs == packets)

        r = client.post("/process/video", json={"key": "uploads/clip_1440.mp4", "max_height": 480})
        check("upload quality caps the ladder over HTTP", r.json().get("renditions") == [144, 240, 360, 480])

        r = client.post("/thumbnail/frames", json={"key": "uploads/clip_1440.mp4", "count": 4})
        check("/thumbnail/frames answers 200", r.status_code == 200)
        frames = r.json()
        check("four frames", len(frames.get("frames", [])) == 4)
        check("first call is not cached", frames.get("cached") is False)

        del store["uploads/clip_1440.mp4"]
        r = client.post("/thumbnail/frames", json={"key": "uploads/clip_1440.mp4", "count": 4})
        check("second call is served from cache", r.json().get("cached") is True)

        store["uploads/clip_1440.mp4"] = source.read_bytes()
        r = client.post("/thumbnail/poster", json={"key": "uploads/clip_1440.mp4", "atSec": 1.5})
        check("/thumbnail/poster answers 200", r.status_code == 200)
        check(
            "poster lands on the canonical key",
            r.json().get("thumbnailKey") == "uploads/clip_1440_hls/poster.jpg",
        )

        r = client.post("/process/video", json={"key": "uploads/does-not-exist.mp4"})
        check("a missing source gives a clean 422", r.status_code == 422)

    print("\n%d/%d passed" % (sum(checks), len(checks)))
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
