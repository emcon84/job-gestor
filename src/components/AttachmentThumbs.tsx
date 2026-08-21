"use client";

import { useState } from "react";
import Image from "next/image";
import ImageLightbox from "@/components/ImageLightbox";

interface AttachmentThumb {
  id: string;
  url: string;
  name: string;
}

interface AttachmentThumbsProps {
  attachments: AttachmentThumb[];
  /** Tailwind size classes for each thumbnail, e.g. "h-16 w-16". */
  sizeClass?: string;
}

export default function AttachmentThumbs({
  attachments,
  sizeClass = "h-16 w-16",
}: AttachmentThumbsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  const images = attachments.map((a) => ({ url: a.url, name: a.name }));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpenIndex(i)}
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
        ))}
      </div>

      {openIndex !== null && (
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
