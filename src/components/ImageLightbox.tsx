"use client";

import { useEffect } from "react";
import Image from "next/image";

interface LightboxImage {
  url: string;
  name: string;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const ARROW = {
  left: "M15 19l-7-7 7-7",
  right: "M9 5l7 7-7 7",
};

export default function ImageLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: ImageLightboxProps) {
  const image = images[index];
  const multiple = images.length > 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar imagen"
        className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl text-white transition-colors hover:bg-black/80"
      >
        ✕
      </button>

      {multiple && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Imagen anterior"
          className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={ARROW.left} />
          </svg>
        </button>
      )}

      <figure
        className="flex max-h-[85vh] max-w-[90vw] flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={image.url}
          alt={image.name}
          width={1600}
          height={1600}
          unoptimized
          className="max-h-[70vh] max-w-[90vw] h-auto w-auto rounded-lg object-contain"
        />
        <figcaption className="px-4 text-center text-sm text-white">
          {image.name} · {index + 1}/{images.length}
        </figcaption>
      </figure>

      {multiple && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Imagen siguiente"
          className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={ARROW.right} />
          </svg>
        </button>
      )}
    </div>
  );
}
