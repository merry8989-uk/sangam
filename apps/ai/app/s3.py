"""Object-storage access for the AI/media worker.

Uses the S3 API so the same code works against MinIO locally and an
India-region bucket (ap-south-1 / Indian provider) in production.
"""

import boto3

from .settings import settings

_client = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
)


def get_bytes(key: str) -> bytes:
    obj = _client.get_object(Bucket=settings.s3_bucket_media, Key=key)
    return obj["Body"].read()


def put_bytes(key: str, data: bytes, content_type: str) -> None:
    _client.put_object(
        Bucket=settings.s3_bucket_media,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
