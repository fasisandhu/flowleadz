import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY || !env.R2_SECRET_KEY) {
    throw new Error("R2 credentials not configured");
  }
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY, secretAccessKey: env.R2_SECRET_KEY },
  });
  return cachedClient;
}

export async function presignPut(key: string, contentType: string, sizeBytes: number, expiresInSeconds = 600) {
  if (!env.R2_BUCKET) throw new Error("R2_BUCKET not configured");
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

export async function presignGet(key: string, expiresInSeconds = 900) {
  if (!env.R2_BUCKET) throw new Error("R2_BUCKET not configured");
  const cmd = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

export async function headObject(key: string) {
  if (!env.R2_BUCKET) throw new Error("R2_BUCKET not configured");
  return client().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

export async function deleteObject(key: string) {
  if (!env.R2_BUCKET) throw new Error("R2_BUCKET not configured");
  return client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
