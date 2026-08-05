import type { HealthSection } from "@/config/health";

import { HEALTH_PALETTE, HealthArt } from "./HealthArt";

/**
 * One whole list, exactly as it is printed on the sheet.
 *
 * Numbered with a real `<ol>` — the paper is numbered, the family refers to
 * "number three", and a screen reader should count them too. The numbers are
 * drawn in the section's own colour on a soft disc, which is a lot friendlier
 * to a child than a column of grey digits and keeps the long lists from
 * reading as a wall of text.
 *
 * Nothing here reflows the wording. See the note at the top of
 * `config/health.ts`: these strings are a transcription.
 */
export function HealthList({ section }: { section: HealthSection }) {
  const palette = HEALTH_PALETTE[section.id];

  return (
    <article
      className="app-card themed-transition overflow-hidden"
      style={{
        backgroundColor: `color-mix(in srgb, ${palette.soft} 30%, var(--color-surface))`,
      }}
    >
      <header className="flex items-center gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <HealthArt id={section.id} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
            {section.title}
          </h2>
          <p
            className="mt-1 text-sm leading-snug"
            style={{ color: "var(--color-text-muted)" }}
          >
            {section.intro}
          </p>
        </div>
      </header>

      <ol className="flex flex-col gap-2.5 p-5 sm:p-6">
        {section.items.map((item, index) => (
          <li key={item} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
              style={{ backgroundColor: palette.soft, color: palette.ink }}
            >
              {index + 1}
            </span>
            <span className="text-base font-semibold leading-snug sm:text-lg">
              {item}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}
