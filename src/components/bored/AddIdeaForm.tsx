"use client";

import { useEffect, useRef, useState } from "react";

import {
  BORED_EMOJI,
  DEFAULT_EMOJI,
  IDEA_LABEL_MAX_LENGTH,
  IDEA_PRICE_DEFAULT,
  IDEA_PRICE_MAX,
  IDEA_PRICE_MIN,
  formatDadBucks,
  isUsablePrice,
  type BoredCategoryId,
} from "@/config/bored";
import { isUsableLabel } from "@/lib/bored/ideas";

import type { BoredPalette } from "./BoredArt";

/**
 * The panel for adding an idea: pick a picture, type a word.
 *
 * ---------------------------------------------------------------------------
 * IT IS NEARLY WORDLESS, WHICH TOOK MORE WORK THAN A FORM USUALLY DOES
 * ---------------------------------------------------------------------------
 * This page's one rule is "as few words as possible", and a form is the natural
 * enemy of that rule — labels, hints, help text, validation prose. So there are
 * no visible field labels at all: the rail is self-evidently a rail of pictures
 * to choose from, the text box says `What is it?` in its placeholder, and the
 * money row is a row of prices with one of them ringed. Every label a screen
 * reader needs is present and `sr-only`.
 *
 * The chosen picture is shown large next to the box, at the size it will be on
 * the tile, so what is being built is visible before it is built.
 *
 * ---------------------------------------------------------------------------
 * THE PRICE ROW IS ONLY ON MONEY, AND IT IS A ROW RATHER THAN A NUMBER FIELD
 * ---------------------------------------------------------------------------
 * A money job with no price would be a tile with no pill in a grid ordered *by*
 * price, so Money asks for one. It asks with ten buttons rather than a number
 * input because this page is used by children: a spinner needs a keyboard, a
 * concept of digits, and a decision about what to do with `Đ0` or `Đ7.5`. Ten
 * taps cannot express any of those.
 */
export function AddIdeaForm({
  categoryId,
  palette,
  pending,
  onAdd,
  onCancel,
}: {
  categoryId: BoredCategoryId;
  palette: BoredPalette;
  /**
   * A write is in flight.
   *
   * The submit button goes dead while it is, which is the only thing standing
   * between an impatient double-tap and two ideas with the same name: both taps
   * would have passed the duplicate check, because neither had committed yet when
   * the other was checked.
   */
  pending?: boolean;
  onAdd: (idea: { label: string; emoji: string; price: number | null }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI[categoryId]);
  const [price, setPrice] = useState(IDEA_PRICE_DEFAULT);
  const field = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const chosenButton = useRef<HTMLButtonElement>(null);

  const wantsPrice = categoryId === "money";
  const ready =
    !pending && isUsableLabel(label) && (!wantsPrice || isUsablePrice(price));

  /*
   * The box takes the focus when the panel opens, so somebody who tapped Add can
   * start typing. The keyboard coming up is the right cost here: the panel is
   * opened deliberately, and the rail of pictures is still reachable above it.
   */
  useEffect(() => {
    field.current?.focus();
  }, []);

  /*
   * Scroll the starting picture into view, once, when the panel opens.
   *
   * Faces come first in the list and each category starts on something thematic —
   * a jigsaw, a tree, a bag of money — so the ring marking the current choice is
   * usually a long way along the rail. Without this it is simply off screen, and
   * the panel opens looking as though nothing is chosen.
   *
   * `scrollLeft` rather than `scrollIntoView`, deliberately: the latter is
   * allowed to scroll every ancestor as well, which on a page that has just
   * expanded a panel means the whole page jumping.
   */
  useEffect(() => {
    const container = rail.current;
    const button = chosenButton.current;
    if (!container || !button) return;
    container.scrollLeft =
      button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2;
    // Once, on open. Deliberately not keyed on `emoji`: re-running on every tap
    // would drag the rail out from under a thumb that is still choosing.
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onAdd({ label, emoji, price: wantsPrice ? price : null });
  }

  return (
    <form
      onSubmit={submit}
      className="app-card themed-transition animate-soft-rise mb-4 flex flex-col gap-3 p-3 sm:p-4"
    >
      {/* --- The picture ------------------------------------------------- */}

      <fieldset>
        <legend className="sr-only">Pick a picture</legend>
        {/*
          A rail: four rows deep, and it scrolls **sideways**.
          -----------------------------------------------------------------
          It was a vertical grid while there were seventy pictures, and that
          stopped working at nearly three hundred — a tall scrolling panel pushed
          the text box off a phone screen, and the panel's scroll fought the
          page's, so a thumb aiming at the pictures moved the page instead.

          Sideways has neither problem. The height is fixed by the row count, so
          the box and the Add button never move; and a horizontal scroll cannot be
          confused with the page's vertical one, which is the same reason the
          bottom tab bar's strip scrolls the way it does.
        */}
        <div
          ref={rail}
          className="bored-emoji-rail rounded-2xl p-1.5"
          style={{ backgroundColor: palette.soft }}
        >
          {BORED_EMOJI.map((option) => {
            const chosen = option === emoji;
            return (
              <button
                key={option}
                type="button"
                ref={chosen ? chosenButton : undefined}
                onClick={() => setEmoji(option)}
                aria-pressed={chosen}
                aria-label={`Picture ${option}`}
                className="flex aspect-square items-center justify-center rounded-xl text-2xl transition-transform duration-150 active:scale-90"
                style={
                  chosen
                    ? {
                        backgroundColor: "var(--color-surface)",
                        boxShadow: `0 0 0 2.5px ${palette.ink}`,
                      }
                    : undefined
                }
              >
                <span aria-hidden="true">{option}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* --- The word ---------------------------------------------------- */}

      <div className="flex items-center gap-3">
        {/*
          The choice, at tile size. This is the preview, and it is why there is no
          "chosen: 🧩" text anywhere — the picture says it.
        */}
        <span
          className="flex aspect-square w-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
          style={{ backgroundColor: palette.soft }}
        >
          <span aria-hidden="true">{emoji}</span>
        </span>

        <label htmlFor="bored-add-label" className="sr-only">
          What is it?
        </label>
        <input
          ref={field}
          id="bored-add-label"
          name="label"
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="What is it?"
          maxLength={IDEA_LABEL_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          className="themed-transition min-w-0 flex-1 rounded-2xl px-4 py-3 text-base font-semibold outline-none placeholder:font-medium"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
        />
      </div>

      {/* --- What it pays ------------------------------------------------ */}

      {wantsPrice && (
        <fieldset>
          <legend className="sr-only">How much it pays</legend>
          <div className="flex flex-wrap gap-1.5">
            {PRICES.map((amount) => {
              const chosen = amount === price;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setPrice(amount)}
                  aria-pressed={chosen}
                  aria-label={`Pays ${formatDadBucks(amount)}`}
                  className="min-w-11 rounded-full px-3 py-2 text-sm font-extrabold tabular-nums transition-transform duration-150 active:scale-95"
                  style={
                    chosen
                      ? { backgroundColor: palette.ink, color: "#ffffff" }
                      : {
                          backgroundColor: palette.soft,
                          color: "var(--color-text)",
                        }
                  }
                >
                  {formatDadBucks(amount)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* --- Done -------------------------------------------------------- */}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!ready}
          className="flex-1 rounded-2xl px-5 py-3 text-base font-extrabold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          style={{ backgroundColor: palette.ink, color: "#ffffff" }}
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl px-4 py-3 text-base font-bold transition-transform duration-150 active:scale-[0.98]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Đ1 to Đ10 — the whole range a job on this page can pay. */
const PRICES: readonly number[] = Array.from(
  { length: IDEA_PRICE_MAX - IDEA_PRICE_MIN + 1 },
  (_, index) => IDEA_PRICE_MIN + index,
);
