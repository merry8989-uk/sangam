from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime config. Point these at India-region services in production."""

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_media: str = "sangam-media"
    s3_region: str = "ap-south-1"

    # Media tooling. Blank means "find on PATH" (the Docker image installs
    # system ffmpeg/ffprobe). Override for local or bundled builds.
    ffmpeg_bin: str = ""
    ffprobe_bin: str = ""

    # Sarvam AI (powers the Indus chat experience). The key is held
    # server-side only and never sent to the browser.
    sarvam_api_key: str = ""
    sarvam_base_url: str = "https://api.sarvam.ai"
    sarvam_model: str = "sarvam-105b"

    # Moderation. The ML backend is opt-in: it needs the extra dependencies in
    # requirements-ml.txt. With it off (or unavailable), the heuristic lexicon
    # runs alone. Models are loaded lazily on first use.
    # When set, the API instance forwards model calls to a separate (GPU)
    # inference service instead of running the models itself.
    ml_inference_url: str = ""

    moderation_enabled: bool = False
    moderation_text_model: str = "unitary/multilingual-toxic-xlm-roberta"
    moderation_image_model: str = "Falconsai/nsfw_image_detection"
    moderation_text_threshold: float = 0.7
    moderation_image_threshold: float = 0.7

    # Embeddings for knowledge-base retrieval. Same opt-in pattern as
    # moderation: a real multilingual model when enabled, a dependency-free
    # lexical hashing embedding otherwise (so retrieval works out of the box).
    embeddings_enabled: bool = False
    embeddings_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embeddings_top_k: int = 4

    class Config:
        env_file = ".env"


settings = Settings()
