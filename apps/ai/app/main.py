from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .agents import alt_text, draft_title_description, suggest_captions, suggest_hashtags, translate
from .embeddings import embed, local_embed
from .media import InvalidImage, process_image
from .moderation import local_text, moderate_text
from .observability import ObservabilityMiddleware, metrics_snapshot
from .recommend import Candidate, recommend, similar
from .sarvam import (
    SarvamError,
    chat as sarvam_chat,
    chat_stream as sarvam_chat_stream,
    is_configured as sarvam_configured,
)
from .settings import settings
from .video import TranscodeError, transcode_video, sample_frames, extract_poster
from .vision import classify_image

app = FastAPI(
    title="Sangam AI service",
    description="Moderation, recommendation and media-enrichment endpoints for Sangam.",
    version="1.0.0",
)

app.add_middleware(ObservabilityMiddleware)


class ModerateIn(BaseModel):
    text: str


class ModerateOut(BaseModel):
    flagged: bool
    score: float
    categories: list[str]
    matches: list[str] = []
    engine: str = "heuristic"
    labels: list[dict] = []


class ModerateImageIn(BaseModel):
    key: str


class RankIn(BaseModel):
    sources: dict[str, list[dict]]
    seen_ids: list[str] = []
    blocked_authors: list[str] = []
    limit: int = 20
    max_per_author: int = 3


class RankOut(BaseModel):
    post_ids: list[str]


class SimilarIn(BaseModel):
    query: list[float]
    pool: list[dict]  # [{post_id, embedding}]
    limit: int = 10


class ProcessImageIn(BaseModel):
    key: str


class ProcessImageOut(BaseModel):
    width: int
    height: int
    thumbnailKey: str
    thumbs: dict[str, str]


class VideoVariant(BaseModel):
    height: int
    width: int
    bitrateK: int
    playlistKey: str


class ProcessVideoIn(BaseModel):
    key: str
    # Optional upload-quality cap and audio bitrate for the ladder.
    max_height: int | None = None
    audio_bitrate: str | None = None


class ProcessVideoOut(BaseModel):
    width: int
    height: int
    durationMs: int
    thumbnailKey: str
    hlsKey: str
    previewKey: str
    renditions: list[int]
    variants: list[VideoVariant] = []


class SampleFramesIn(BaseModel):
    key: str
    count: int = 8


class FrameOut(BaseModel):
    atSec: float
    key: str


class SampleFramesOut(BaseModel):
    frames: list[FrameOut]
    durationMs: int


class PosterIn(BaseModel):
    key: str
    atSec: float


class PosterOut(BaseModel):
    thumbnailKey: str
    atSec: float


@app.post("/thumbnail/frames", response_model=SampleFramesOut)
def thumbnail_frames_endpoint(payload: SampleFramesIn) -> SampleFramesOut:
    try:
        return SampleFramesOut(**sample_frames(payload.key, payload.count))
    except TranscodeError as exc:
        raise HTTPException(status_code=422, detail=f"Could not sample frames: {exc}") from exc


@app.post("/thumbnail/poster", response_model=PosterOut)
def thumbnail_poster_endpoint(payload: PosterIn) -> PosterOut:
    try:
        return PosterOut(**extract_poster(payload.key, payload.atSec))
    except TranscodeError as exc:
        raise HTTPException(status_code=422, detail=f"Could not set poster: {exc}") from exc


@app.get("/metrics")
def metrics() -> dict:
    return metrics_snapshot()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "region": settings.s3_region, "sarvam_configured": sarvam_configured()}


@app.post("/moderate", response_model=ModerateOut)
def moderate(payload: ModerateIn) -> ModerateOut:
    r = moderate_text(payload.text)
    return ModerateOut(
        flagged=r.flagged, score=r.score, categories=r.categories,
        matches=r.matches, engine=r.engine, labels=r.labels,
    )


@app.post("/moderate/image", response_model=ModerateOut)
def moderate_image(payload: ModerateImageIn) -> ModerateOut:
    r = classify_image(payload.key)
    return ModerateOut(
        flagged=r.flagged, score=r.score, categories=r.categories,
        matches=r.matches, engine=r.engine, labels=r.labels,
    )


@app.post("/feed/rank", response_model=RankOut)
def feed_rank(payload: RankIn) -> RankOut:
    sources = {
        name: [
            Candidate(
                post_id=c["post_id"],
                author_id=c.get("author_id", ""),
                engagement=float(c.get("engagement", 0.0)),
                recency_hours=float(c.get("recency_hours", 0.0)),
                affinity=float(c.get("affinity", 0.0)),
            )
            for c in items
        ]
        for name, items in payload.sources.items()
    }
    ids = recommend(
        sources,
        seen_ids=payload.seen_ids,
        blocked_authors=payload.blocked_authors,
        limit=payload.limit,
        max_per_author=payload.max_per_author,
    )
    return RankOut(post_ids=ids)


@app.post("/similar", response_model=RankOut)
def similar_posts(payload: SimilarIn) -> RankOut:
    pool = [(p["post_id"], [float(x) for x in p["embedding"]]) for p in payload.pool]
    return RankOut(post_ids=similar(payload.query, pool, payload.limit))


@app.post("/process/image", response_model=ProcessImageOut)
def process_image_endpoint(payload: ProcessImageIn) -> ProcessImageOut:
    try:
        return ProcessImageOut(**process_image(payload.key))
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=f"Not a valid image: {exc}") from exc


@app.post("/process/video", response_model=ProcessVideoOut)
def process_video_endpoint(payload: ProcessVideoIn) -> ProcessVideoOut:
    try:
        return ProcessVideoOut(
            **transcode_video(
                payload.key,
                max_height=payload.max_height,
                audio_bitrate=payload.audio_bitrate,
            )
        )
    except TranscodeError as exc:
        raise HTTPException(status_code=422, detail=f"Could not transcode video: {exc}") from exc


class AssistIn(BaseModel):
    task: Literal["captions", "hashtags", "title", "alt_text", "translate"]
    text: str = ""
    tone: str = "friendly"
    target: str = "hi-IN"


class AssistOut(BaseModel):
    result: dict


@app.post("/agents/assist", response_model=AssistOut)
def agents_assist(payload: AssistIn) -> AssistOut:
    if payload.task == "captions":
        return AssistOut(result={"captions": suggest_captions(payload.text, payload.tone)})
    if payload.task == "hashtags":
        return AssistOut(result={"hashtags": suggest_hashtags(payload.text)})
    if payload.task == "title":
        return AssistOut(result=draft_title_description(payload.text))
    if payload.task == "alt_text":
        return AssistOut(result={"alt_text": alt_text(payload.text)})
    if payload.task == "translate":
        return AssistOut(result=translate(payload.text, payload.target))
    raise HTTPException(status_code=400, detail="unknown task")


class ChatMessageIn(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatIn(BaseModel):
    messages: list[ChatMessageIn]
    system: str | None = None
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2048
    reasoning_effort: str | None = None


class ChatOut(BaseModel):
    content: str
    model: str | None = None
    reasoning: str | None = None
    usage: dict | None = None


@app.post("/chat", response_model=ChatOut)
def chat_endpoint(payload: ChatIn) -> ChatOut:
    """Public chat endpoint (no login required). The caller may pass a system
    prompt - the web layer uses this to inject a user's agent configuration."""
    messages: list[dict] = []
    if payload.system:
        messages.append({"role": "system", "content": payload.system})
    messages.extend(m.model_dump() for m in payload.messages)
    try:
        return ChatOut(**sarvam_chat(
            messages,
            model=payload.model,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
            reasoning_effort=payload.reasoning_effort,
        ))
    except SarvamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/chat/stream")
def chat_stream_endpoint(payload: ChatIn) -> StreamingResponse:
    """Streaming variant of /chat - forwards Sarvam's SSE to the client."""
    messages: list[dict] = []
    if payload.system:
        messages.append({"role": "system", "content": payload.system})
    messages.extend(m.model_dump() for m in payload.messages)

    def event_source():
        try:
            for line in sarvam_chat_stream(
                messages,
                model=payload.model,
                temperature=payload.temperature,
                max_tokens=payload.max_tokens,
                reasoning_effort=payload.reasoning_effort,
            ):
                yield (line + "\n\n") if line else "\n"
        except SarvamError as exc:
            detail = str(exc).replace('"', "'")
            yield 'data: {"error": "' + detail + '"}\n\n'
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class EmbedIn(BaseModel):
    texts: list[str]


class EmbedOut(BaseModel):
    embeddings: list[list[float]]
    dim: int
    engine: str


@app.post("/embed", response_model=EmbedOut)
def embed_endpoint(payload: EmbedIn) -> EmbedOut:
    """Embed texts for knowledge-base retrieval."""
    if not payload.texts or len(payload.texts) > 256:
        raise HTTPException(status_code=400, detail="texts must contain 1..256 items")
    return EmbedOut(**embed(payload.texts))


class InferTextIn(BaseModel):
    text: str


class InferEmbedIn(BaseModel):
    texts: list[str]


@app.post("/infer/text")
def infer_text(payload: InferTextIn) -> dict:
    """Model-only text moderation. This is the surface a GPU worker exposes."""
    r = local_text(payload.text)
    if r is None:
        raise HTTPException(status_code=503, detail="text model not enabled on this instance")
    return {"flagged": r.flagged, "score": r.score, "categories": r.categories,
            "labels": r.labels, "engine": r.engine}


@app.post("/infer/embed")
def infer_embed(payload: InferEmbedIn) -> dict:
    """Model-only embeddings. This is the surface a GPU worker exposes."""
    v = local_embed(payload.texts)
    if v is None:
        raise HTTPException(status_code=503, detail="embeddings model not enabled on this instance")
    return v
