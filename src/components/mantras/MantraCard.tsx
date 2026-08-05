import { NavIcon } from "@/components/nav/NavIcon";
import type { Mantra } from "@/config/mantras";

/**
 * One mantra: what we say, what we mean, and the words it came from.
 *
 * The visual hierarchy is the whole point of this component. The mantra is
 * large and unattributed because it belongs to the family; the quote is
 * indented behind a rule, in the speaker's voice, with their name under it.
 * Nobody reading this should be able to confuse the two — which is also why
 * the quote is marked up as a real `<blockquote>` with `<cite>` rather than
 * styled text, so a screen reader announces the boundary too.
 */
export function MantraCard({
  mantra,
  headingLevel = 2,
}: {
  mantra: Mantra;
  /** So the page can keep a sane heading outline around the hero. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="app-card flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-primary)",
          }}
        >
          <NavIcon name={mantra.icon} className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <Heading className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
            {mantra.text}
          </Heading>
          <p
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: "var(--color-text-muted)" }}
          >
            {mantra.meaning}
          </p>
        </div>
      </div>

      <figure className="m-0">
        <blockquote
          className="border-l-[3px] pl-4 text-[0.95rem] italic leading-relaxed"
          style={{ borderColor: "var(--color-primary)" }}
          cite={mantra.source.url}
        >
          “{mantra.quote}”
        </blockquote>
        <figcaption className="mt-2.5 pl-4">
          <cite className="not-italic">
            <span className="text-sm font-bold">{mantra.source.author}</span>
            <span
              className="block text-xs leading-snug"
              style={{ color: "var(--color-text-muted)" }}
            >
              {mantra.source.role}
            </span>
            <a
              href={mantra.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline decoration-dotted underline-offset-2"
              style={{ color: "var(--color-primary)" }}
            >
              {mantra.source.title}
              <span
                className="font-normal"
                style={{ color: "var(--color-text-muted)" }}
              >
                · {mantra.source.occasion}
              </span>
            </a>
          </cite>
        </figcaption>
      </figure>
    </article>
  );
}
