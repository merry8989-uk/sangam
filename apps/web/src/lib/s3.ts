import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveStorage } from "./storage";

/**
 * Object storage.
 *
 * Everything below is S3-compatible and nothing else: PutObject, GetObject,
 * DeleteObject and a presigned URL. That means the backend is a configuration
 * choice, not a code change - AWS S3 in Mumbai, an Indian provider such as E2E
 * EOS or NxtGen, a local MinIO, or Cloudflare R2.
 *
 * `lib/storage.ts` resolves which one from the environment and says whether the
 * bytes leave India. Read `storage.leavesIndia` before making a claim about
 * where the media lives: R2 has no India storage jurisdiction, so a deployment
 * on R2 is not India-hosted for media, whatever the rest of the stack does.
 */
export const storage = resolveStorage();

export const s3 = new S3Client({
  region: storage.region,
  endpoint: storage.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? ""
  }
});

export const MEDIA_BUCKET = storage.bucket;

// Public base for read-only media. Front this with the CDN in production and
// keep the bucket private; the presigned download below is the private path.
const PUBLIC_BASE = storage.publicBase;

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
