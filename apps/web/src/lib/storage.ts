/**
 * Which object storage the media lives in, and where that puts it.
 *
 * The app only ever uses PutObject, GetObject, DeleteObject and a presigned URL,
 * so every S3-compatible provider works without a code change - the endpoint and
 * the region are the whole difference.
 *
 * This resolves that choice from the environment, and states plainly whether the
 * bytes leave India. That last part matters more than it looks: the project
 * describes itself as India-hosted, and one of the supported providers cannot
 * honour that, because Cloudflare R2 has no India storage jurisdiction. Saying
 * so in code means the trade-off is visible at the point someone configures it,
 * rather than only in a document nobody reads.
 *
 * Kept pure so the resolution can be tested without a network or a bucket.
 */

export const STORAGE_BACKENDS = ["r2", "aws", "minio", "custom"] as const;
export type StorageBackend = (typeof STORAGE_BACKENDS)[number];

/**
 * The jurisdictions R2 will actually guarantee. India is not among them - the
 * list is eu, us, fedramp and fedramp-high. Location hints such as `apac` are
 * documented by Cloudflare as "best effort and not a guarantee", which is not
 * something a residency obligation can rest on.
 */
export const R2_JURISDICTIONS = ["eu", "us", "fedramp", "fedramp-high"] as const;

export type StorageConfig = {
  backend: StorageBackend;
  /** Where the S3 API lives. Undefined means AWS's own endpoints. */
  endpoint: string | undefined;
  region: string;
  bucket: string;
  /** The base a browser reads media from. Usually a CDN in front of the bucket. */
  publicBase: string;
  /** Does storing media here take it outside India? */
  leavesIndia: boolean;
  /** The Indian region the deployment claims, when it is staying in India. */
  inIndiaRegion: string | null;
  /** A line for an operator reading the resolved config. */
  note: string;
};

type Env = Record<string, string | undefined>;

const AWS_INDIA_REGIONS = ["ap-south-1", "ap-south-2"];

function clean(env: Env, key: string): string {
  return (env[key] ?? "").trim();
}

/** R2's S3 endpoint. A jurisdiction, when set, changes the host. */
export function r2Endpoint(accountId: string, jurisdiction?: string): string {
  const j = (jurisdiction ?? "").trim().toLowerCase();
  const host = j ? `${accountId}.${j}.r2.cloudflarestorage.com` : `${accountId}.r2.cloudflarestorage.com`;
  return `https://${host}`;
}

/**
 * Work out the backend and what it means.
 *
 * Order matters: an explicit R2 account wins, then an endpoint that names a
 * provider, then a bare region (which means AWS), then anything else.
 */
export function resolveStorage(env: Env = process.env): StorageConfig {
  const bucket = clean(env, "S3_BUCKET_MEDIA") || "sangam-media";
  const publicBase = clean(env, "S3_PUBLIC_ENDPOINT") || "http://localhost:9000";

  const accountId = clean(env, "R2_ACCOUNT_ID");
  const jurisdiction = clean(env, "R2_JURISDICTION");
  const endpointEnv = clean(env, "S3_ENDPOINT");

  // ---- Cloudflare R2 ----
  if (accountId || endpointEnv.includes("r2.cloudflarestorage.com")) {
    const endpoint = accountId ? r2Endpoint(accountId, jurisdiction) : endpointEnv;
    const known = (R2_JURISDICTIONS as readonly string[]).includes(jurisdiction.toLowerCase());
    return {
      backend: "r2",
      endpoint,
      // R2 ignores the region but the SDK insists on one; `auto` is what it
      // documents for an S3 client.
      region: "auto",
      bucket,
      publicBase,
      leavesIndia: true,
      inIndiaRegion: null,
      note: known
        ? `Cloudflare R2 in the ${jurisdiction} jurisdiction. Media is outside India.`
        : "Cloudflare R2. Media is outside India - R2 has no India storage jurisdiction, " +
          "so the India-hosted claim does not hold for media on this backend."
    };
  }

  // ---- local MinIO ----
  if (!endpointEnv || endpointEnv.includes("minio") || endpointEnv.includes("localhost") || endpointEnv.includes("127.0.0.1")) {
    if (!endpointEnv) {
      const region = clean(env, "S3_REGION") || "ap-south-1";
      return {
        backend: "aws",
        endpoint: undefined,
        region,
        bucket,
        publicBase,
        leavesIndia: !AWS_INDIA_REGIONS.includes(region),
        inIndiaRegion: AWS_INDIA_REGIONS.includes(region) ? region : null,
        note: AWS_INDIA_REGIONS.includes(region)
          ? `AWS S3 in ${region}. Media stays in India.`
          : `AWS S3 in ${region}, which is not an Indian region. Media leaves India.`
      };
    }
    return {
      backend: "minio",
      endpoint: endpointEnv,
      region: clean(env, "S3_REGION") || "us-east-1",
      bucket,
      publicBase,
      leavesIndia: false,
      inIndiaRegion: null,
      note: "A local MinIO. Development only."
    };
  }

  // ---- anything else that speaks S3 ----
  const region = clean(env, "S3_REGION") || "ap-south-1";
  const looksIndian =
    endpointEnv.includes("e2enetworks") ||
    endpointEnv.includes("nxtgen") ||
    endpointEnv.includes("ap-south") ||
    AWS_INDIA_REGIONS.includes(region);
  return {
    backend: "custom",
    endpoint: endpointEnv,
    region,
    bucket,
    publicBase,
    leavesIndia: !looksIndian,
    inIndiaRegion: looksIndian ? region : null,
    note: looksIndian
      ? `A custom S3 endpoint that appears to be in India (${region}).`
      : `A custom S3 endpoint in ${region}. Confirm where it stores data before claiming India hosting.`
  };
}

/** A one-line summary, for a health check or a startup log. */
export function describeStorage(config: StorageConfig): string {
  const where = config.leavesIndia ? "outside India" : "in India";
  return `${config.backend} · bucket ${config.bucket} · region ${config.region} · media ${where}`;
}
