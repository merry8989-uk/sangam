from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .media import InvalidImage, process_image
from .moderation import moderate_text
from .recommend import Candidate, rank
from .settings import settings
from .video import TranscodeError, transcode_video

app = FastAPI(
    title="Sangam AI service",
    description="Moderation, recommendation and media-enrichment endpoints for Sangam.",
    version="0.3.0",
)


class ModerateIn(BaseModel):
    text: str


class ModerateOut(BaseModel):
    flagged: bool
    score: float
    categories: list[str]


class RankIn(BaseModel):
    candidates: list[dict]
    limit: int = 20


class RankOut(BaseModel):
    post_ids: list[str]


class ProcessImageIn(BaseModel):
    key: str


class ProcessImageOut(BaseModel):
    width: int
    height: int
    thumbnailKey: str
    thumbs: dict[str, str]


class ProcessVideoIn(BaseModel):
    key: str


class ProcessVideoOut(BaseModel):
    width: int
    height: int
    durationMs: int
    thumbnailKey: str
    hlsKey: str
    renditions: list[int]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "region": settings.s3_region}


@app.post("/moderate", response_model=ModerateOut)
def moderate(payload: ModerateIn) -> ModerateOut:
    result = moderate_text(payload.text)
    return ModerateOut(flagged=result.flagged, score=result.score, categories=result.categories)


@app.post("/recommend", response_model=RankOut)
def recommend(payload: RankIn) -> RankOut:
    candidates = [
        Candidate(
            post_id=c["post_id"],
            engagement=float(c.get("engagement", 0.0)),
            recency_hours=float(c.get("recency_hours", 0.0)),
            affinity=float(c.get("affinity", 0.0)),
        )
        for c in payload.candidates
    ]
    return RankOut(post_ids=rank(candidates, payload.limit))


@app.post("/process/image", response_model=ProcessImageOut)
def process_image_endpoint(payload: ProcessImageIn) -> ProcessImageOut:
    try:
        return ProcessImageOut(**process_image(payload.key))
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=f"Not a valid image: {exc}") from exc


@app.post("/process/video", response_model=ProcessVideoOut)
def process_video_endpoint(payload: ProcessVideoIn) -> ProcessVideoOut:
    try:
        return ProcessVideoOut(**transcode_video(payload.key))
    except TranscodeError as exc:
        raise HTTPException(status_code=422, detail=f"Could not transcode video: {exc}") from exc
