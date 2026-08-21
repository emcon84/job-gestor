"use client";

import { useState } from "react";
import Image from "next/image";
import { FileArchive } from "lucide-react";
import ImageLightbox from "@/components/ImageLightbox";
import { ALLOWED_ARCHIVE_MIME } from "@/lib/r2";

interface AttachmentThumb {
  id: string;
  url: string;
  name: string;
  /** MIME type when known (helps decide image vs archive rendering). */
  contentType?: string;
}

interface AttachmentThumbsProps {
  attachments: AttachmentThumb[];
  /** Tailwind size classes for each thumbnail, e.g. "h-16 w-16". */
  sizeClass?: string;
  /**
   * When true (default), each thumb is a button that opens the lightbox.
   * When false, thumbs are plain images — useful when the surrounding card is
   * itself clickable and the lightbox lives inside a detail modal.
   */
  interactive?: boolean;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "gz", "tar"]);

function isImage(a: AttachmentThumb): boolean {
  if (a.contentType) {
    if (a.contentType.startsWith("image/")) return true;
    if (ALLOWED_ARCHIVE_MIME.has(a.contentType)) return false;
  }
  const ext = a.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isArchive(a: AttachmentThumb): boolean {
  if (a.contentType && ALLOWED_ARCHIVE_MIME.has(a.contentType)) return true;
  const ext = a.name.split(".").pop()?.toLowerCase() ?? "";
  return ARCHIVE_EXTS.has(ext);
}

export default function AttachmentThumbs({
  attachments,
  sizeClass = "h-16 w-16",
  interactive = true,
}: AttachmentThumbsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.filter(isImage).map((a) => ({ url: a.url, name: a.name }));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          if (isArchive(a)) {
            return (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`Descargar ${a.name}`}
                className="flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-card-border px-2 py-1 text-xs text-secondary transition-colors hover:border-accent hover:text-primary"
              >
                <FileArchive className="h-5 w-5 shrink-0 text-status-progress" />
                <span className="truncate">{a.name}</span>
              </a>
            );
          }

          const imageIndex = images.findIndex((img) => img.url === a.url);
          if (interactive) {
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenIndex(imageIndex)}
                className="rounded-lg border border-card-border p-1 transition-colors hover:border-accent"
                aria-label={`Ver imagen ${a.name}`}
              >
                <Image
                  src={a.url}
                  alt={a.name}
                  width={64}
                  height={64}
                  unoptimized
                  className={`${sizeClass} rounded object-cover`}
                />
              </button>
            );
          }
          return (
            <span
              key={a.id}
              className="rounded-lg border border-card-border p-1"
            >
              <Image
                src={a.url}
                alt={a.name}
                width={64}
                height={64}
                unoptimized
                className={`${sizeClass} rounded object-cover`}
              />
            </span>
          );
        })}
      </div>

      {interactive && openIndex !== null && openIndex >= 0 && images.length > 0 && (
        <ImageLightbox
          images={images}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onPrev={() =>
            setOpenIndex((i) =>
              i === null ? i : (i - 1 + images.length) % images.length,
            )
          }
          onNext={() =>
            setOpenIndex((i) => (i === null ? i : (i + 1) % images.length))
          }
        />
      )}
    </>
  );
}