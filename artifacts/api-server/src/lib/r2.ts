import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ── Cloudflare R2 (S3-compatible) client ───────────────────────────────
// R2 has zero egress fees and is S3-compatible, so we use the AWS SDK
// pointed at the R2 endpoint. Region is "auto" because R2 is global —
// the bucket lives in the region you picked when creating it.
//
// Required environment variables (set in Render → Environment, NOT in
// this file):
//   R2_ENDPOINT              e.g. https://<account-id>.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID         R2 API token access key
//   R2_SECRET_ACCESS_KEY     R2 API token secret
//   R2_BUCKET_NAME           bucket to upload to
//
// The server will throw at first call if any are missing — that's
// intentional, the same fail-loud pattern as JWT_SECRET.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[r2] ${name} is required but not set in the environment.`);
  return v;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return _client;
}

function bucket(): string {
  return requireEnv("R2_BUCKET_NAME");
}

/** Upload a file buffer to R2. Returns the storage key. */
export async function uploadToR2(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));
  return key;
}

/**
 * Generate a time-limited signed URL for a private object. Users get a
 * URL that's valid for `expiresInSec` seconds (default 1 hour) and then
 * stops working — much safer than serving via the API process.
 */
export async function getSignedFileUrl(key: string, expiresInSec = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  }), { expiresIn: expiresInSec });
}

/** Delete an object from R2. */
export async function deleteFromR2(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
