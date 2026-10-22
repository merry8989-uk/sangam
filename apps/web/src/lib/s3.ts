import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Object storage. In production point S3_ENDPOINT at an India-region bucket
// (ap-south-1, or an Indian provider such as E2E EOS / NxtGen) so media
// never leaves Indian jurisdiction.
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "ap-south-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? ""
  }
});

export const MEDIA_BUCKET = process.env.S3_BUCKET_MEDIA ?? "sangam-media";

// Public base for read-only media (the bucket is set to public-read in dev).
// In production front this with the CDN and keep the bucket private.
const PUBLIC_BASE = process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:9000";

export function mediaUrl(key: string): string {
  return `${PUBLIC_BASE}/${MEDIA_BUCKET}/${key}`;
}

/**
 * Does this storage key belong to an upload this user was given?
 *
 * The upload route mints keys as `raw/<userId>/<uuid>.<ext>`, so the prefix is
 * proof of who was issued the key. Without this check a post could be created
 * referencing someone else's key and republish their media: the feed exposes
 * every media key, and the new Media row would be owned by the poster, so every
 * later access check would pass.
 */
export function keyBelongsToUser(key: string, userId: string): boolean {
  return typeof key === "string" && key.startsWith(`raw/${userId}/`);
}

export async function presignUpload(key: string, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: MEDIA_BUCKET,
    Key: key,
    ContentType: contentType
  });
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
}

export async function presignDownload(key: string) {
  const cmd = new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
}
