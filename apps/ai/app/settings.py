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

    class Config:
        env_file = ".env"


settings = Settings()
