"use client";

import Image from "next/image";
import { useState } from "react";

import type { SchoolDocument } from "@/config/documents";
import { documentImages } from "@/config/documents";

import { DocumentViewer } from "./DocumentViewer";

/**
 * One document, as a card you tap to open full-screen.
 *
 * Matches `HealthSectionCard`'s shape — a themed `app-card`, the picture as
 * the biggest thing on it, the whole card as the tap target — because a
 * document and a list are both "tap this to read the whole thing."
 */
export function DocumentCard({ doc }: { doc: SchoolDocument }) {
  const [open, setOpen] = useState(false);
  const images = documentImages(doc);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="app-card themed-transition flex w-full items-center gap-4 p-3 text-left transition-transform active:scale-[0.98] sm:gap-5 sm:p-4"
      >
        <span
          className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-20"
          style={{ boxShadow: "0 0 0 1px var(--color-border)" }}
        >
          <Image
            src={images.thumb.src}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold leading-tight tracking-tight sm:text-lg">
            {doc.title}
          </span>
          <span
            className="mt-0.5 block text-sm leading-snug"
            style={{ color: "var(--color-text-muted)" }}
          >
            {doc.description}
          </span>
        </span>

        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-text-muted)" }}
          aria-hidden="true"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>

      {open ? <DocumentViewer doc={doc} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
