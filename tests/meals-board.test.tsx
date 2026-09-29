import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MealsBoard } from "@/components/meals/MealsBoard";
import { FAMILY_SIZE } from "@/config/meals";
import { compiledCatalog, seedId } from "@/lib/meals/seed";
import { EMPTY_FAMILY_STATE, type FamilyMealState, type MealsCatalog } from "@/lib/meals/types";

/*
 * Server Actions are POST endpoints and cannot run in jsdom, so they are
 * mocked — the tests assert on what the board asks them to do, and on what
 * somebody holding the phone sees before any answer arrives.
 */
const actions = vi.hoisted(() => ({
  addMealToPlan: vi.fn(),
  clearMealPlan: vi.fn(),
  finishPlanEntry: vi.fn(),
  logMealCooked: vi.fn(),
  rateMeal: vi.fn(),
  removeFromPlan: vi.fn(),
  sendPlanToShoppingList: vi.fn(),
  setMealFavorite: vi.fn(),
  setPantryItem: vi.fn(),
  updatePlanEntry: vi.fn(),
}));
vi.mock("@/lib/meals/actions", () => actions);
vi.mock("@/lib/meals/admin-actions", () => ({ saveIngredientPrices: vi.fn() }));

const TACOS = seedId("recipe", "tacos-beef");
const TACOS_CHICKEN = seedId("recipe", "tacos-chicken");

function renderBoard(
  overrides: {
    catalog?: MealsCatalog;
    state?: FamilyMealState;
    unlocked?: boolean;
    initialTab?: "meals" | "plan" | "prices";
    initialMealId?: string | null;
  } = {},
) {
  const catalog = overrides.catalog ?? { ...compiledCatalog(), source: "database" as const };
  return render(
    <MealsBoard
      catalog={catalog}
      state={overrides.state ?? EMPTY_FAMILY_STATE}
      unlocked={overrides.unlocked ?? false}
      initialTab={overrides.initialTab ?? "meals"}
      initialMealId={overrides.initialMealId ?? null}
      initialDateIso="2026-09-28"
    />,
  );
}

beforeEach(() => {
  for (const mock of Object.values(actions)) {
    mock.mockReset();
    mock.mockResolvedValue({ ok: true });
  }
});

describe("the Meals list", () => {
  it("shows the starter catalog, cheapest first, with a price for the whole family", () => {
    renderBoard();
    const cards = screen.getAllByRole("button", { name: /per person/ });
    expect(cards.length).toBeGreaterThan(60);
    expect(cards[0].textContent).toContain("White Rice");
    expect(cards[0].textContent).toContain(`for ${FAMILY_SIZE}`);
  });

  it("collapses versions into one card", () => {
    renderBoard();
    const tacos = screen.getByRole("button", { name: /^Tacos \(beef\)/ });
    expect(tacos.textContent).toContain("2 versions");
    expect(screen.queryByRole("button", { name: /^Tacos \(chicken\)/ })).toBeNull();
  });

  it("searches by ingredient as well as by name", () => {
    renderBoard();
    fireEvent.change(screen.getByPlaceholderText("Search meals or ingredients"), {
      target: { value: "pickled nothing" },
    });
    expect(screen.getByText(/No meals match/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search meals or ingredients"), {
      target: { value: "basic nachos" },
    });
    expect(screen.getByRole("button", { name: /^Nachos \(Basic\)/ })).toBeTruthy();
  });

  it("narrows to one time of day", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Desserts" }));
    const names = screen.getAllByRole("button", { name: /per person/ }).map((b) => b.textContent);
    expect(names.some((text) => text?.includes("Chocolate Chip Cookies"))).toBe(true);
    expect(names.some((text) => text?.includes("Lasagna"))).toBe(false);
  });

  it("says so when there is nothing for the dice to pick", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Favorites/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pick a random meal" }));
    expect(screen.getByText("Nothing to pick from with these filters.")).toBeTruthy();
  });

  it("lets the dice open a meal", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Pick a random meal" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("a meal's sheet", () => {
  it("opens from a shared link, scaled for the family", () => {
    renderBoard({ initialMealId: TACOS_CHICKEN });
    const dialog = screen.getByRole("dialog", { name: "Tacos (chicken)" });
    expect(within(dialog).getByText(`For ${FAMILY_SIZE}`, { selector: "span" })).toBeTruthy();
    // Both versions are offered.
    expect(within(dialog).getByRole("tab", { name: "Tacos (beef)" })).toBeTruthy();
  });

  it("switches between versions", () => {
    renderBoard({ initialMealId: TACOS });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Tacos (chicken)" }));
    expect(within(dialog).getByRole("heading", { name: "Tacos (chicken)" })).toBeTruthy();
  });

  it("favourites straight away, before the server answers", async () => {
    let answer: (value: { ok: true }) => void = () => {};
    actions.setMealFavorite.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderBoard({ initialMealId: TACOS });

    const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Favorite" });
    await act(async () => fireEvent.click(button));

    expect(actions.setMealFavorite).toHaveBeenCalledWith({ recipeId: TACOS, favorite: true });
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Favorited" })).toBeTruthy();
    await act(async () => answer({ ok: true }));
  });

  it("adds to the plan for the whole family by default", async () => {
    renderBoard({ initialMealId: TACOS });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Add to plan/ }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Add" })));

    expect(actions.addMealToPlan).toHaveBeenCalledTimes(1);
    const entry = actions.addMealToPlan.mock.calls[0][0];
    expect(entry).toMatchObject({ recipeId: TACOS, servings: FAMILY_SIZE, day: null });
    expect(entry.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("rates a person's face through love, OK and no thanks", async () => {
    renderBoard({ initialMealId: TACOS });
    const hannah = within(screen.getByRole("dialog")).getByRole("button", { name: /^Hannah/ });
    await act(async () => fireEvent.click(hannah));
    expect(actions.rateMeal).toHaveBeenCalledWith({ recipeId: TACOS, personId: "hannah", score: 3 });
  });

  it("logs a meal as made on the phone's own date", async () => {
    renderBoard({ initialMealId: TACOS });
    const button = within(screen.getByRole("dialog")).getByRole("button", { name: "We made this today" });
    await act(async () => fireEvent.click(button));
    const call = actions.logMealCooked.mock.calls[0][0];
    expect(call).toMatchObject({ recipeId: TACOS, made: true });
    expect(call.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("puts a failed save back, and says why", async () => {
    actions.setMealFavorite.mockResolvedValue({ ok: false, message: "That could not be saved. Try again." });
    renderBoard({ initialMealId: TACOS });
    await act(async () =>
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Favorite" })),
    );
    expect(screen.getByText("That could not be saved. Try again.")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Favorite" })).toBeTruthy();
  });

  it("puts Edit on every meal, and lets the editor ask for the PIN", () => {
    const { unmount } = renderBoard({ initialMealId: TACOS });
    // Locked or not, Edit is right there; the editor page is the one that
    // asks for the PIN, then opens straight onto this recipe.
    expect(screen.getByRole("link", { name: /Edit/ }).getAttribute("href")).toBe(
      `/meals/admin/recipes/${TACOS}`,
    );
    expect(screen.queryByRole("link", { name: "Make a copy" })).toBeNull();
    unmount();
    renderBoard({ initialMealId: TACOS, unlocked: true });
    expect(screen.getByRole("link", { name: "Make a copy" })).toBeTruthy();
  });

  it("has no Share button — the family did not want one", () => {
    renderBoard({ initialMealId: TACOS });
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Share" })).toBeNull();
  });
});

describe("the plan", () => {
  const planned: FamilyMealState = {
    ...EMPTY_FAMILY_STATE,
    plan: {
      entries: [{ id: "aaaaaaaaaaaaaaaaaaaaaaaa", recipeId: TACOS, servings: 7, day: 0 }],
      haveIt: [],
    },
  };

  it("invites a first meal when it is empty", () => {
    renderBoard({ initialTab: "plan" });
    expect(screen.getByText(/No meals planned yet/)).toBeTruthy();
  });

  it("shows the budget and the shopping list, split by store", () => {
    renderBoard({ initialTab: "plan", state: planned });
    expect(screen.getByText("Budget")).toBeTruthy();
    expect(screen.getByText("Hard taco shells")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Walmart/ })).toBeTruthy();
  });

  it("changes servings straight away", async () => {
    renderBoard({ initialTab: "plan", state: planned });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "More servings of Tacos (beef)" })),
    );
    expect(actions.updatePlanEntry).toHaveBeenCalledWith({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", servings: 8 });
  });

  it("ticks an ingredient off as already in the pantry", async () => {
    /*
     * Held pending, as the favourite test's action is: once a mocked action
     * settles, `useOptimistic` falls back to the props — which in the real
     * page have just been re-rendered with the change, and here never are.
     */
    let answer: (value: { ok: true }) => void = () => {};
    actions.setPantryItem.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderBoard({ initialTab: "plan", state: planned });
    const row = screen.getByText("Hard taco shells").closest("li") as HTMLElement;
    await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Have it" })));
    expect(actions.setPantryItem).toHaveBeenCalledWith({
      ingredientId: seedId("ingredient", "taco-shells"),
      have: true,
    });
    expect(screen.getByText("Already have")).toBeTruthy();
    await act(async () => answer({ ok: true }));
  });

  it("reports what went onto the family shopping list", async () => {
    actions.sendPlanToShoppingList.mockResolvedValue({ ok: true, added: 7, alreadyThere: 1, skippedFull: 0 });
    renderBoard({ initialTab: "plan", state: planned });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Add to the family shopping list" })),
    );
    expect(screen.getByText("Added 7 to the shopping list · 1 already on it.")).toBeTruthy();
  });
});

describe("when the database is away", () => {
  it("shows the starter menu, says so, and offers nothing that would fail", async () => {
    renderBoard({ catalog: compiledCatalog(), initialMealId: TACOS });
    expect(screen.getByText(/built-in starter menu/)).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "Favorite" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: /Add to plan/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the price book", () => {
  it("lists every ingredient with its unit price, and hides editing from children", () => {
    renderBoard({ initialTab: "prices" });
    expect(screen.getByText("Cheddar cheese, shredded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update price" })).toBeNull();
    expect(screen.getAllByText(/Starter estimate/).length).toBeGreaterThan(0);
  });

  it("offers a quick price update once the PIN is in", () => {
    renderBoard({ initialTab: "prices", unlocked: true });
    expect(screen.getAllByRole("button", { name: "Update price" }).length).toBeGreaterThan(0);
  });
});
