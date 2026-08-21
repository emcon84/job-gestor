/**
 * Attachment (Vercel Blob) helpers.
 *
 * Attachments are IMAGES ONLY. The MIME whitelist and 10MB cap are enforced on
 * both the server (authoritative) and the client (UX). When no
 * `BLOB_READ_WRITE_TOKEN` is configured (local dev without Blob), the module
 * falls back to a dev mode with no real token so the UI still works.
 */
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

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

export interface UploadToken {
  token: string;
  allowedContentTypes: string[];
  maxSizeBytes: number;
}

/**
 * Returns a scoped client upload token (production) or a dev fallback with an
 * empty token. Must run in a server context.
 */
export async function getUploadToken(): Promise<UploadToken> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const token = await generateClientTokenFromReadWriteToken({
      pathname: "attachments/*",
      allowedContentTypes: [...ALLOWED_IMAGE_MIME],
      maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
      // The SDK default is 30 seconds and uses the serverless clock, which can
      // be skewed — tokens were arriving already expired. Use an explicit 1h
      // window (docs recommendation) so uploads never race the clock.
      validUntil: Date.now() + 60 * 60 * 1000,
    });
    return {
      token,
      allowedContentTypes: [...ALLOWED_IMAGE_MIME],
      maxSizeBytes: MAX_ATTACHMENT_BYTES,
    };
  }
  // Dev fallback: no real token, the client UI still works with local URLs.
  return {
    token: "",
    allowedContentTypes: [...ALLOWED_IMAGE_MIME],
    maxSizeBytes: MAX_ATTACHMENT_BYTES,
  };
}

/** Whether the Blob integration is configured (vs dev fallback). */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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
