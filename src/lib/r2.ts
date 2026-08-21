/**
 * Attachment (Cloudflare R2) helpers.
 *
 * Attachments are IMAGES ONLY. The MIME whitelist and 10MB cap are enforced on
 * both the server (authoritative) and the client (UX). Uploads go directly from
 * the browser to R2 via a short-lived presigned PUT URL; the object is served
 * back through the bucket's public r2.dev URL.
 *
 * When the R2 credentials are missing (local dev / tests) the module falls back
 * to a dev mode with an empty upload URL so the UI still works.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

/** Image-only MIME whitelist. */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Image extension that maps to a whitelisted MIME type. */
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Replaces characters that are unsafe in an object key. */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** R2 object key prefix for attachment uploads. */
const ATTACHMENT_PREFIX = "attachments";

/**
 * Maps a client filename/type to a whitelisted MIME type, or returns null when
 * the file is not an allowed image. Used for server-side validation.
 */
export function resolveImageType(
  mime: string | undefined,
  filename: string,
): string | null {
  if (mime && ALLOWED_IMAGE_MIME.has(mime)) {
    return mime;
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = EXT_TO_MIME[ext];
  return fromExt ?? null;
}

/** Whether R2 is configured (vs dev fallback). */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export interface UploadUrl {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

/**
 * Builds a presigned PUT URL (1h window) for a single image upload to R2.
 * Returns an empty `uploadUrl` (dev fallback) when R2 is not configured so the
 * UI still works locally without credentials. Must run in a server context.
 */
export async function getUploadUrl({
  filename,
  contentType,
}: {
  filename: string;
  contentType: string;
}): Promise<UploadUrl> {
  const objectKey = `${ATTACHMENT_PREFIX}/${Date.now()}-${sanitizeFilename(filename)}`;
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const publicUrl = base ? `${base}/${objectKey}` : objectKey;

  if (!isR2Configured()) {
    return { uploadUrl: "", objectKey, publicUrl };
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return { uploadUrl, objectKey, publicUrl };
}
