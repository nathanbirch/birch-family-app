"use client";

import { useRef, useState } from "react";

import { ITEM_NAME_MAX_LENGTH } from "@/config/shopping";
import { isUsableItemName } from "@/lib/shopping/list";

/**
 * The box you type into.
 *
 * ---------------------------------------------------------------------------
 * IT KEEPS THE KEYBOARD
 * ---------------------------------------------------------------------------
 * Adding to a shopping list is never one thing. Somebody standing at an open
 * fridge adds milk, then eggs, then butter, and the design decision that matters
 * most is the one that costs nothing to describe: the field clears itself and
 * takes the focus straight back, so the keyboard never drops and the second item
 * is one word away rather than one tap and one word away.
 *
 * The `<form>` is real rather than decorative, which is what makes the return key
 * on a phone keyboard submit — and `enterKeyHint` is what makes that key say
 * "done" instead of a bare arrow.
 */
export function AddItemForm({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement>(null);

  const usable = isUsableItemName(value);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!usable) return;

    /*
     * Cleared before the add is dispatched, not after it resolves. The row is
     * drawn optimistically anyway, so waiting would only mean a field that sits
     * full for a moment with the item already visible above it.
     */
    setValue("");
    onAdd(value);
    field.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label htmlFor="shopping-add" className="sr-only">
        Add something to the shopping list
      </label>

      <div className="relative min-w-0 flex-1">
        <input
          ref={field}
          id="shopping-add"
          name="item"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Add something…"
          maxLength={ITEM_NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          className="themed-transition w-full rounded-2xl px-4 py-3.5 text-base font-semibold outline-none placeholder:font-medium"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 1px 2px var(--color-shadow)",
          }}
        />
      </div>

      {/*
        Disabled until there is something to add, rather than accepting the tap
        and doing nothing. The transition on `opacity` is what stops that state
        change from being a flicker as the first letter is typed.
      */}
      <button
        type="submit"
        disabled={!usable}
        className="shrink-0 rounded-2xl px-5 py-3.5 text-base font-extrabold transition-all duration-200 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "var(--color-on-primary)",
        }}
      >
        Add
      </button>
    </form>
  );
}
