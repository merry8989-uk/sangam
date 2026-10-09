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

    class Config:
        env_file = ".env"


settings = Settings()
