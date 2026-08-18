import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BORED_PALETTE } from "@/components/bored/BoredArt";
import { BoredGrid } from "@/components/bored/BoredGrid";
import {
  BORED_EMOJI,
  DEFAULT_EMOJI,
  IDEA_LABEL_MAX_LENGTH,
  IDEA_PRICE_DEFAULT,
  findBoredCategory,
  formatDadBucks,
} from "@/config/bored";
import {
  compiledItems,
  isCustomIdeaId,
  type BoredItem,
} from "@/lib/bored/ideas";

/*
 * Adding an idea from inside the app.
 *
 * The Server Actions cannot run in jsdom — they are POST endpoints, not plain
 * functions — so they are mocked, and these tests assert on what the grid *asks*
 * them to do plus what the child sees before any answer comes back.
 */
const addBoredIdea = vi.hoisted(() => vi.fn());
const removeBoredIdea = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bored/actions", () => ({ addBoredIdea, removeBoredIdea }));

const compiled = compiledItems();

function custom(overrides: Partial<BoredItem> = {}): BoredItem {
  return {
    id: "own-abcdefghij",
    label: "Build a den",
    price: null,
    emoji: "🏕️",
    custom: true,
    ...overrides,
  };
}

function renderGrid(
  categoryId: "inside" | "outside" | "money" = "inside",
  items: BoredItem[] = compiled[categoryId],
) {
  return render(
    <BoredGrid
      categoryId={categoryId}
      items={items}
      palette={BORED_PALETTE[categoryId]}
    />,
  );
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
}

function type(text: string) {
  fireEvent.change(screen.getByLabelText(/what is it\?/i), {
    target: { value: text },
  });
}

function submit() {
  fireEvent.submit(screen.getByLabelText(/what is it\?/i).closest("form")!);
}

/** The tiles currently drawn, by their label. */
function tiles(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((tile) => tile.textContent?.trim() ?? "");
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  addBoredIdea.mockResolvedValue({ ok: true });
  removeBoredIdea.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the grid before anybody adds anything", () => {
  it("draws every idea it was given", () => {
    renderGrid("inside");
    expect(tiles()).toHaveLength(compiled.inside.length);
  });

  it("offers one control and no form until it is asked for", () => {
    renderGrid("inside");
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.queryByLabelText(/what is it\?/i)).toBeNull();
  });

  it("puts no cross on a built-in tile", () => {
    /*
     * The built-in list is the page's content, and five children can reach these
     * tiles. Removing one is an edit to `config/bored.ts` and a reseed, which is
     * the right amount of friction.
     */
    renderGrid("inside");
    expect(screen.queryByRole("button", { name: /take .* off the list/i })).toBeNull();
  });
});

describe("adding one", () => {
  it("draws the tile before the write has finished", async () => {
    let release: (value: { ok: true }) => void = () => {};
    addBoredIdea.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderGrid("inside");
    openForm();
    type("Trampoline park");
    await act(async () => submit());

    // The child who just typed it is watching this space. A round trip is a long
    // time to watch an empty square.
    expect(screen.getByText("Trampoline park")).toBeTruthy();

    await act(async () => {
      release({ ok: true });
    });
  });

  it("sends the category it was added on, so there is nothing to choose", async () => {
    renderGrid("outside");
    openForm();
    type("Sandpit");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea).toHaveBeenCalledTimes(1);
    expect(addBoredIdea.mock.calls[0][0]).toMatchObject({
      categoryId: "outside",
      label: "Sandpit",
      price: null,
    });
  });

  it("sends a tidied label and an id the action will accept", async () => {
    renderGrid("inside");
    openForm();
    type("  make   a  card  ");
    await act(async () => submit());
    await settle();

    const sent = addBoredIdea.mock.calls[0][0];
    expect(sent.label).toBe("make a card");
    expect(isCustomIdeaId(sent.ideaId)).toBe(true);
  });

  it("starts on a picture, so nothing can be added without one", async () => {
    renderGrid("inside");
    openForm();
    type("Origami");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea.mock.calls[0][0].emoji).toBe(DEFAULT_EMOJI.inside);
  });

  it("sends whichever picture was tapped", async () => {
    const chosen = BORED_EMOJI[3];

    renderGrid("inside");
    openForm();
    fireEvent.click(screen.getByRole("button", { name: `Picture ${chosen}` }));
    type("Dice game");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea.mock.calls[0][0].emoji).toBe(chosen);
  });

  it("offers every picture, on a rail that scrolls sideways", () => {
    /*
     * Nearly three hundred of them, four rows deep. The class carries the layout
     * — see `.bored-emoji-rail` in globals.css — and it is asserted here because
     * losing it turns the picker back into a tall vertical scroller that pushes
     * the text box off a phone screen.
     */
    renderGrid("inside");
    openForm();

    const rail = document.querySelector(".bored-emoji-rail");
    expect(rail).not.toBeNull();
    expect(
      screen.getAllByRole("button", { name: /^Picture / }),
    ).toHaveLength(BORED_EMOJI.length);
  });

  it("marks the chosen picture as chosen, for a screen reader too", () => {
    const chosen = BORED_EMOJI[5];
    renderGrid("inside");
    openForm();

    const button = screen.getByRole("button", { name: `Picture ${chosen}` });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("will not send an empty idea", async () => {
    renderGrid("inside");
    openForm();
    type("   ");
    await act(async () => submit());
    await settle();
    expect(addBoredIdea).not.toHaveBeenCalled();
  });

  it("stops the typing at the ceiling rather than trimming it later", () => {
    // Twenty characters is enforced by the box as well as by the action, so
    // nobody types a sentence and then watches half of it disappear.
    renderGrid("inside");
    openForm();
    const field = screen.getByLabelText(/what is it\?/i) as HTMLInputElement;
    expect(field.maxLength).toBe(IDEA_LABEL_MAX_LENGTH);
  });

  it("never draws a tile for something already on the page", async () => {
    /*
     * The bug this test exists for, reported from the real app: type "Puzzle" onto
     * a grid that has had a Puzzle on it since the day it shipped, and the tile
     * appeared, then vanished, with a red message under it. Every step of that was
     * working as written — and it reads as a broken app, because the most likely
     * way to fail an add was also the one that flashed a tile at you first.
     *
     * The whole list is already on the client, so the answer is known before
     * anything is drawn, and the server is not asked at all.
     */
    renderGrid("inside");
    openForm();
    type("Puzzle");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea).not.toHaveBeenCalled();
    expect(screen.getByText("“Puzzle” is already here.")).toBeTruthy();
    expect(tiles()).toHaveLength(compiled.inside.length);
  });

  it("matches a duplicate regardless of case or spacing", () => {
    renderGrid("inside");
    openForm();
    type("  puzzle ");
    fireEvent.submit(screen.getByLabelText(/what is it\?/i).closest("form")!);
    expect(screen.getByText("“Puzzle” is already here.")).toBeTruthy();
  });

  it("points at the tile that is already there", () => {
    // "Puzzle is already here" leaves somebody scanning twelve tiles for it. The
    // one it clashed with is highlighted, which is the half the message misses.
    renderGrid("inside");
    openForm();
    type("Puzzle");
    fireEvent.submit(screen.getByLabelText(/what is it\?/i).closest("form")!);

    const tile = screen.getByText("Puzzle").closest("li")!;
    expect(tile.getAttribute("data-idea-id")).toBe("puzzle");
    // The highlight is inline colour rather than a class, so that it cannot fight
    // the entrance animation for the `animation` property.
    expect(tile.querySelector<HTMLElement>(".app-card")!.style.backgroundColor).not.toBe("");
  });

  it("keeps the panel open and the typing when an add is refused", async () => {
    /*
     * The other half of the reported bug. The panel used to close the instant Add
     * was tapped, so recovering from the likeliest failure meant reopening it and
     * typing the whole thing again.
     */
    renderGrid("inside");
    openForm();
    type("Puzzle");
    await act(async () => submit());
    await settle();

    const field = screen.getByLabelText(/what is it\?/i) as HTMLInputElement;
    expect(field.value).toBe("Puzzle");
  });

  it("takes the tile back off and says why when the server refuses", async () => {
    /*
     * A refusal the client could not have predicted — the other phone in the house
     * added "Marbles" a second ago, so this device's copy of the list does not have
     * it. That is what the server-side check is for, and this is the path where a
     * tile really does appear and then go.
     */
    addBoredIdea.mockResolvedValue({
      ok: false,
      message: "“Marbles” is already here.",
    });

    renderGrid("inside");
    openForm();
    type("Marbles");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea).toHaveBeenCalledTimes(1);
    expect(screen.getByText("“Marbles” is already here.")).toBeTruthy();
    expect(tiles()).toHaveLength(compiled.inside.length);
  });

  it("goes dead while the write is in flight, so two taps are not two ideas", async () => {
    /*
     * Both taps would have passed the duplicate check — neither had committed when
     * the other was checked — so this button is the only thing between an impatient
     * thumb and two identical tiles.
     */
    let release: (value: { ok: true }) => void = () => {};
    addBoredIdea.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderGrid("inside");
    openForm();
    type("Marbles");
    await act(async () => submit());

    expect(screen.getByRole("button", { name: /adding/i })).toBeTruthy();
    await act(async () => submit());
    expect(addBoredIdea).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ ok: true });
    });
  });

  it("closes the form once the idea is away", async () => {
    renderGrid("inside");
    openForm();
    type("Marbles");
    await act(async () => submit());
    await settle();
    expect(screen.queryByLabelText(/what is it\?/i)).toBeNull();
  });

  it("can be given up on", () => {
    renderGrid("inside");
    openForm();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText(/what is it\?/i)).toBeNull();
  });

  it("reverts the tile when the transition settles with no fresh data", async () => {
    /*
     * Not a bug — the reason `lib/bored/actions.ts` must keep calling
     * `revalidatePath`. `useOptimistic` drops its patch the moment the transition
     * finishes, so the tile only stays because the action's revalidation has
     * replaced the server props by then. Here nothing replaces them, and the tile
     * goes: this test is what will fail if that revalidation is ever removed for
     * looking redundant.
     */
    renderGrid("inside");
    openForm();
    type("Kite");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Kite")).toBeNull();
  });
});

describe("adding a job to the Money page", () => {
  it("asks what it pays, which the other two pages do not", () => {
    renderGrid("money");
    openForm();
    expect(
      screen.getByRole("button", { name: `Pays ${formatDadBucks(IDEA_PRICE_DEFAULT)}` }),
    ).toBeTruthy();

    // Nothing of the sort on Inside.
    cleanup();
    renderGrid("inside");
    openForm();
    expect(screen.queryByRole("button", { name: /^Pays /i })).toBeNull();
  });

  it("starts on a price, so a job can never be filed without one", async () => {
    renderGrid("money");
    openForm();
    type("Wash the dog");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea.mock.calls[0][0].price).toBe(IDEA_PRICE_DEFAULT);
  });

  it("sends whichever price was tapped", async () => {
    renderGrid("money");
    openForm();
    fireEvent.click(screen.getByRole("button", { name: `Pays ${formatDadBucks(3)}` }));
    type("Fold the towels");
    await act(async () => submit());
    await settle();

    expect(addBoredIdea.mock.calls[0][0].price).toBe(3);
  });

  it("puts a cheap new job where its price says, not at the end", async () => {
    /*
     * The Money grid is read by price, cheapest first, and that ordering is the
     * only thing standing in for headings and a filter. A Đ1 job appended to the
     * bottom would break it — see `sortCategoryItems`.
     */
    let release: (value: { ok: true }) => void = () => {};
    addBoredIdea.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderGrid("money");
    openForm();
    fireEvent.click(screen.getByRole("button", { name: `Pays ${formatDadBucks(1)}` }));
    type("Feed the cat");
    await act(async () => submit());

    const labels = tiles();
    expect(labels.findIndex((label) => label.includes("Feed the cat"))).toBeLessThan(2);

    await act(async () => {
      release({ ok: true });
    });
  });

  it("shows the price on the new tile", async () => {
    let release: (value: { ok: true }) => void = () => {};
    addBoredIdea.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderGrid("money");
    openForm();
    fireEvent.click(screen.getByRole("button", { name: `Pays ${formatDadBucks(7)}` }));
    type("Wash the windows");
    await act(async () => submit());

    const tile = screen.getByText("Wash the windows").closest("li")!;
    expect(within(tile).getByText(formatDadBucks(7))).toBeTruthy();

    await act(async () => {
      release({ ok: true });
    });
  });
});

describe("taking one back off", () => {
  it("offers a cross on the family's own tiles only", () => {
    renderGrid("inside", [...compiled.inside, custom()]);
    const crosses = screen.getAllByRole("button", {
      name: /take .* off the list/i,
    });
    expect(crosses).toHaveLength(1);
    expect(crosses[0].getAttribute("aria-label")).toBe(
      "Take Build a den off the list",
    );
  });

  it("removes it, and says which one", async () => {
    const ours = custom();
    renderGrid("inside", [...compiled.inside, ours]);

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: /take build a den off the list/i }),
      ),
    );

    expect(removeBoredIdea).toHaveBeenCalledWith({
      categoryId: "inside",
      ideaId: ours.id,
    });
  });

  it("takes the tile away at once", () => {
    renderGrid("inside", [...compiled.inside, custom()]);
    expect(screen.getByText("Build a den")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /take build a den off the list/i }),
    );
    expect(screen.queryByText("Build a den")).toBeNull();
  });

  it("says so when it could not be removed", async () => {
    removeBoredIdea.mockResolvedValue({
      ok: false,
      message: "That could not be taken off. Try again.",
    });

    renderGrid("inside", [...compiled.inside, custom()]);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: /take build a den off the list/i }),
      ),
    );
    await settle();

    expect(screen.getByText(/could not be taken off/i)).toBeTruthy();
  });
});

describe("a family-added tile", () => {
  it("shows its emoji where a built-in shows its drawing", () => {
    renderGrid("inside", [custom({ emoji: "🦖" })]);
    const tile = screen.getByText("Build a den").closest("li")!;
    expect(tile.textContent).toContain("🦖");
    // Nothing drawn inside the picture frame: the emoji *is* the picture. Scoped
    // to the frame because the tile has one other SVG on it — the remove cross.
    expect(tile.querySelector(".bored-tile-frame svg")).toBeNull();
  });

  it("keeps a built-in's drawing rather than looking for an emoji", () => {
    const lego = compiled.inside.find((idea) => idea.id === "lego")!;
    renderGrid("inside", [lego]);
    const tile = screen.getByText("Lego").closest("li")!;
    expect(tile.querySelector(".bored-tile-frame svg")).not.toBeNull();
  });

  it("hides its picture from a screen reader, which the label already carries", () => {
    renderGrid("inside", [custom({ emoji: "🦖" })]);
    const tile = screen.getByText("Build a den").closest("li")!;
    const picture = within(tile).getByText("🦖");
    expect(picture.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the page it was added from", () => {
  it("is one of the three, and each has its own colour", () => {
    for (const id of ["inside", "outside", "money"] as const) {
      expect(findBoredCategory(id)).not.toBeNull();
      expect(BORED_PALETTE[id]).toBeDefined();
    }
  });
});
