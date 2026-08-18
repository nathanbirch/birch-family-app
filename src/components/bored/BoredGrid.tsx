"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { DEFAULT_EMOJI, type BoredCategoryId } from "@/config/bored";
import { addBoredIdea, removeBoredIdea } from "@/lib/bored/actions";
import {
  findLabelClash,
  newIdeaId,
  normaliseLabel,
  sortCategoryItems,
  type BoredItem,
} from "@/lib/bored/ideas";

import { AddIdeaForm } from "./AddIdeaForm";
import type { BoredPalette } from "./BoredArt";
import { IdeaCard } from "./IdeaCard";

/**
 * One category's grid, and the button that adds to it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A CLIENT COMPONENT AND THE GRID USED NOT TO BE
 * ---------------------------------------------------------------------------
 * The grid was a pure server render for as long as the ideas were compiled in:
 * nothing on it could change while somebody was looking at it. Being able to add
 * one changes that, and the reason it needs an island is not the form — a form can
 * post to a Server Action on its own — but the *tile appearing*. A round trip
 * before the picture shows up is a long time on this page, and the child who just
 * typed "Trampoline" is watching the empty space where it should be.
 *
 * So the new tile is drawn optimistically and the write goes out behind it.
 *
 * ---------------------------------------------------------------------------
 * `useOptimistic` HERE, AND NOT ON THE SHOPPING LIST
 * ---------------------------------------------------------------------------
 * Worth pinning down, because the two pages look like they want the same
 * mechanism and do not. `useOptimistic` reverts the moment its transition
 * settles, which is only safe when the action's own `revalidatePath` has already
 * replaced the server props by then — true here, and deliberately not true of the
 * shopping list, which has no revalidation because a live stream tells it
 * instead. See `hooks/useShoppingList.ts` for the machinery that is needed when
 * that guarantee is absent, and be glad this page does not need it.
 *
 * ---------------------------------------------------------------------------
 * THE ADD BUTTON IS ON THE CATEGORY PAGE, NOT THE INDEX
 * ---------------------------------------------------------------------------
 * Which is what makes the whole feature need no category chooser: an idea added
 * on `/bored/outside` is an outside idea because that is where you were standing.
 * There is nothing to pick, nothing to get wrong, and nothing to explain — which
 * on this page is worth more than it would be anywhere else.
 */
export function BoredGrid({
  categoryId,
  items,
  palette,
}: {
  categoryId: BoredCategoryId;
  items: readonly BoredItem[];
  palette: BoredPalette;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The tile a rejected add clashed with. Highlighted so "which one?" is answered. */
  const [flashId, setFlashId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * Ids added or removed on *this* device during this render pass. Only these
   * animate: on first paint every tile is old news, and a grid that animated all
   * twelve in would look like it was being written as you watched.
   */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const grid = useRef<HTMLUListElement>(null);

  /*
   * The highlight brings itself to the eye and then gets out of the way.
   *
   * Scrolled to because the Money grid is fifteen tiles and the one being pointed
   * at may be below the fold — `block: "nearest"` does nothing at all when it is
   * already on screen, which is the common case. Optional-called because jsdom has
   * no layout and therefore no `scrollIntoView`, and a picker test should not fail
   * on a scroll it cannot perform.
   */
  useEffect(() => {
    if (!flashId) return;

    grid.current
      ?.querySelector(`[data-idea-id="${flashId}"]`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });

    const timer = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  const [shown, applyOptimistic] = useOptimistic(
    items,
    (current: readonly BoredItem[], patch: Patch): readonly BoredItem[] => {
      if (patch.kind === "add") {
        return sortCategoryItems(categoryId, [...current, patch.item]);
      }
      return current.filter((item) => item.id !== patch.id);
    },
  );

  function add(input: { label: string; emoji: string; price: number | null }) {
    setError(null);
    setFlashId(null);

    const label = normaliseLabel(input.label);

    /*
     * Asked here, before anything is drawn.
     *
     * This is the bug this function used to have, and it is worth spelling out
     * because the code looked right: the add went straight out optimistically, the
     * tile appeared, the Server Action refused it for being a duplicate, and the
     * tile vanished again with a red message under it. Adding something already on
     * the page is the *most likely* way an add fails — typing "Puzzle" onto a grid
     * that has had a Puzzle on it since the day it shipped — so it was also the
     * most likely thing to see, and appearing-then-vanishing reads as a bug even
     * when the message is correct.
     *
     * The whole list is already in `items`, so the browser can answer it without
     * asking anybody. The action still checks, because two phones cannot see each
     * other's screens; this is about the common case never needing the round trip.
     */
    const clash = findLabelClash(shown, label);
    if (clash) {
      setError(`“${clash.label}” is already here.`);
      setFlashId(clash.id);
      return;
    }

    /*
     * The id is invented here rather than on the server, for the same reason the
     * shopping list does it: the tile drawn optimistically has the same identity
     * as the row that comes back, so React keeps the same element when the real
     * data arrives instead of swapping in an identical-looking new one — and a
     * retry after a dropped connection collides with its own first attempt on the
     * unique index rather than adding the idea twice.
     */
    const item: BoredItem = {
      id: newIdeaId(),
      label,
      price: input.price,
      emoji: input.emoji,
      custom: true,
    };
    setFresh((current) => new Set(current).add(item.id));

    startTransition(async () => {
      applyOptimistic({ kind: "add", item });
      const result = await addBoredIdea({
        categoryId,
        ideaId: item.id,
        label: item.label,
        emoji: item.emoji ?? DEFAULT_EMOJI[categoryId],
        price: item.price,
      });

      /*
       * The panel closes on success only.
       *
       * It used to close the instant Add was tapped, which meant a refusal left
       * somebody looking at a red message with their typing gone — so recovering
       * from the most likely failure meant reopening the panel and typing the whole
       * thing again. Staying open costs the length of one write and keeps the words
       * where they can be edited.
       */
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  }

  function remove(item: BoredItem) {
    setError(null);

    startTransition(async () => {
      applyOptimistic({ kind: "remove", id: item.id });
      const result = await removeBoredIdea({
        categoryId,
        ideaId: item.id,
      });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <>
      {/*
        The button is *replaced* by the panel rather than sitting above it, which
        is a small thing that avoids a real one: the panel's own submit button also
        says "Add", and two buttons with the same name on one screen is a genuine
        ambiguity — to somebody using a screen reader, and to anybody else.
        Swapping one for the other means there is only ever one "Add" to press,
        and the panel already carries its own way out.
      */}
      <div className={`flex items-center justify-end ${open ? "" : "mb-4"}`}>
        {/*
          A plus and one word. It is the only control on the page, so it does not
          have to compete with anything — but it is deliberately not the biggest
          thing on the screen either, because most visits to this page are looking
          for something to do rather than wanting to file a new idea.
        */}
        <button
          type="button"
          hidden={open}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition-transform duration-150 active:scale-[0.97]"
          style={{ backgroundColor: palette.ink, color: "#ffffff" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      </div>

      {open && (
        <AddIdeaForm
          categoryId={categoryId}
          palette={palette}
          pending={pending}
          onAdd={add}
          onCancel={() => setOpen(false)}
        />
      )}

      {/*
        The one place this page carries a sentence, and it only ever appears when
        something has gone wrong. Announced politely rather than assertively: a
        failed add is worth reading, not worth interrupting for.
      */}
      <div aria-live="polite">
        {error ? (
          <p
            className="animate-soft-rise mb-3 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, #dc2626 12%, transparent)",
              color: "#b91c1c",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <ul
        ref={grid}
        className="animate-soft-rise grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {shown.map((item) => (
          <li key={item.id} data-idea-id={item.id}>
            <IdeaCard
              idea={item}
              palette={palette}
              entering={fresh.has(item.id)}
              flash={flashId === item.id}
              onRemove={item.custom ? () => remove(item) : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * How long a clashing tile stays highlighted.
 *
 * Long enough to find it after reading the message, short enough that it is not
 * still lit up when somebody comes back to the page a minute later.
 */
const FLASH_MS = 1_800;

type Patch =
  | { kind: "add"; item: BoredItem }
  | { kind: "remove"; id: string };
