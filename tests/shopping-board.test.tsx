import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingBoard } from "@/components/shopping/ShoppingBoard";
import {
  isItemId,
  revisionToken,
  toList,
  type ShoppingItem,
  type ShoppingList,
} from "@/lib/shopping/list";
import { LIST_EVENT, BYE_EVENT, REVISION_PARAM } from "@/lib/shopping/stream";

/*
 * The Server Actions cannot run in jsdom — they are POST endpoints, not plain
 * functions — so they are mocked, and these tests assert on what the board *asks*
 * them to do plus what the person holding the phone sees before any answer comes
 * back. The stream is faked for the same reason: jsdom has no `EventSource`, and
 * a real one would need a server.
 */
const addShoppingItem = vi.hoisted(() => vi.fn());
const setShoppingItemComplete = vi.hoisted(() => vi.fn());
const removeShoppingItem = vi.hoisted(() => vi.fn());

vi.mock("@/lib/shopping/actions", () => ({
  addShoppingItem,
  setShoppingItemComplete,
  removeShoppingItem,
}));

/* -------------------------------------------------------------------------- */
/* A stream that does what the tests say                                       */
/* -------------------------------------------------------------------------- */

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  /** Every connection ever opened, in order. The handover is testable this way. */
  static opened: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Pretend the server said something. */
  emit(type: string, data = "") {
    if (type === "open") this.readyState = FakeEventSource.OPEN;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
}

/** The connection the page is currently listening on. */
function stream(): FakeEventSource {
  const latest = FakeEventSource.opened[FakeEventSource.opened.length - 1];
  expect(latest, "no stream was opened").toBeDefined();
  return latest;
}

/* -------------------------------------------------------------------------- */

const T = new Date(2026, 7, 18, 16, 0, 0).getTime();

/*
 * One id per name, stable for the whole run, so a test can say `item("milk").id`
 * and mean the row it rendered. Derived from a counter rather than from the
 * letters of the name: an earlier version hashed the name into hex and quietly
 * gave "thing1" and "thing10" the same id.
 */
const ids = new Map<string, string>();

function idFor(name: string): string {
  const existing = ids.get(name);
  if (existing) return existing;
  const id = (ids.size + 1).toString(16).padStart(24, "0");
  ids.set(name, id);
  return id;
}

function item(name: string, overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: idFor(name),
    name,
    addedBy: "Birch Family",
    createdAt: T,
    completedAt: null,
    completedBy: null,
    ...overrides,
  };
}

function listOf(items: ShoppingItem[]): ShoppingList {
  return toList(items, revisionToken(items.length, T));
}

function renderBoard(initial: ShoppingList = listOf([])) {
  return render(<ShoppingBoard initial={initial} me="Birch Family" />);
}

/** Every row still to get, in the order they are drawn. */
function wantedRows(): string[] {
  const region = screen.getByRole("region", { name: /still to get/i, hidden: true });
  return within(region)
    .queryAllByRole("checkbox")
    .map((row) => row.textContent ?? "");
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole("checkbox", { name: new RegExp(name, "i") });
}

async function settle() {
  // Flushes the promise the mocked action returns, plus React's own work.
  await act(async () => {
    await Promise.resolve();
  });
}

/** Waits out the board's deliberate exit animation. See `EXIT_MS`. */
async function afterTheAnimation() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 340));
  });
}

beforeEach(() => {
  addShoppingItem.mockResolvedValue({ ok: true });
  setShoppingItemComplete.mockResolvedValue({ ok: true });
  removeShoppingItem.mockResolvedValue({ ok: true });
  FakeEventSource.opened = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("what is on the list", () => {
  it("shows the newest thing first", () => {
    renderBoard(
      listOf([
        item("bread", { createdAt: T - 5_000 }),
        item("milk", { createdAt: T }),
      ]),
    );
    expect(wantedRows().map((text) => text.toLowerCase())).toEqual(["milk", "bread"]);
  });

  it("counts what is still needed", () => {
    renderBoard(listOf([item("milk"), item("bread")]));
    expect(screen.getByText("2 things to get")).toBeTruthy();
  });

  it("says so when there is nothing to get", () => {
    renderBoard();
    expect(screen.getByText(/the list is empty/i)).toBeTruthy();
  });

  it("renders the whole list on the first paint, before any stream connects", () => {
    /*
     * The reason the page reads from MongoDB server-side rather than fetching on
     * mount. Somebody opening this in a supermarket aisle on a bad signal should
     * see the list, not a spinner.
     */
    render(<ShoppingBoard initial={listOf([item("milk")])} me="Birch Family" />);
    expect(screen.getByRole("checkbox", { name: /milk/i })).toBeTruthy();
  });
});

describe("adding something", () => {
  it("draws the row before the write has finished", async () => {
    let release: (value: { ok: true }) => void = () => {};
    addShoppingItem.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderBoard();
    typeAndAdd("Eggs");

    // The row is there while the action is still in flight. This is the whole
    // point of the optimistic patch.
    expect(screen.getByRole("checkbox", { name: /eggs/i })).toBeTruthy();

    await act(async () => {
      release({ ok: true });
    });
    expect(screen.getByRole("checkbox", { name: /eggs/i })).toBeTruthy();
  });

  it("sends a tidied name and an id MongoDB will take", async () => {
    renderBoard();
    typeAndAdd("  brown   bread  ");
    await settle();

    expect(addShoppingItem).toHaveBeenCalledTimes(1);
    const sent = addShoppingItem.mock.calls[0][0];
    expect(sent.name).toBe("brown bread");
    expect(isItemId(sent.id)).toBe(true);
  });

  it("clears the box and keeps the keyboard, so the next thing is one word away", async () => {
    renderBoard();
    typeAndAdd("Eggs");
    await settle();

    const field = screen.getByLabelText(/add something to the shopping list/i);
    expect((field as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(field);
  });

  it("refuses to send whitespace", async () => {
    renderBoard();
    typeAndAdd("   ");
    await settle();
    expect(addShoppingItem).not.toHaveBeenCalled();
  });

  it("says when something is already on the list, without asking the server", async () => {
    renderBoard(listOf([item("Milk")]));
    typeAndAdd("  MILK ");
    await settle();

    expect(addShoppingItem).not.toHaveBeenCalled();
    expect(screen.getByText(/milk is already on the list/i)).toBeTruthy();
    // And exactly one row, not two.
    expect(wantedRows()).toHaveLength(1);
  });

  it("puts the row back when the server refuses", async () => {
    addShoppingItem.mockResolvedValue({
      ok: false,
      message: "That could not be added. Try again.",
    });

    renderBoard();
    typeAndAdd("Eggs");
    await settle();

    expect(screen.queryByRole("checkbox", { name: /eggs/i })).toBeNull();
    expect(screen.getByText(/could not be added/i)).toBeTruthy();
  });
});

describe("ticking something off", () => {
  it("files it under Bought", async () => {
    renderBoard(listOf([item("milk")]));

    fireEvent.click(rowFor("milk"));
    await afterTheAnimation();
    await settle();

    expect(setShoppingItemComplete).toHaveBeenCalledWith({
      id: item("milk").id,
      done: true,
    });
    expect(wantedRows()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /bought/i })).toBeTruthy();
  });

  it("keeps the row on screen while it animates out", async () => {
    /*
     * The one deliberate delay on the page. Removing the row on the same frame as
     * the tap means it is gone before the eye has confirmed which row was tapped,
     * which on a list of similar words is genuinely disorienting.
     */
    renderBoard(listOf([item("milk")]));
    fireEvent.click(rowFor("milk"));

    expect(wantedRows()).toHaveLength(1);
    expect(setShoppingItemComplete).not.toHaveBeenCalled();

    await afterTheAnimation();
    await settle();
    expect(setShoppingItemComplete).toHaveBeenCalledTimes(1);
  });

  it("puts something back when it is unticked", async () => {
    renderBoard(listOf([item("milk", { completedAt: T, completedBy: "Dad" })]));

    fireEvent.click(screen.getByRole("button", { name: /bought/i }));
    fireEvent.click(rowFor("milk"));
    await afterTheAnimation();
    await settle();

    expect(setShoppingItemComplete).toHaveBeenCalledWith({
      id: item("milk").id,
      done: false,
    });
    expect(wantedRows().map((text) => text.toLowerCase())).toContain("milk");
  });

  it("removes a row outright when the bin is tapped", async () => {
    renderBoard(listOf([item("milk")]));

    fireEvent.click(screen.getByRole("button", { name: /remove milk/i }));
    await settle();

    expect(removeShoppingItem).toHaveBeenCalledWith({ id: item("milk").id });
    expect(wantedRows()).toHaveLength(0);
  });
});

describe("the Bought accordion", () => {
  it("cannot be opened when nothing has been bought", () => {
    renderBoard(listOf([item("milk")]));
    const toggle = screen.getByRole("button", { name: /bought/i });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens and closes", () => {
    renderBoard(listOf([item("milk", { completedAt: T })]));
    const toggle = screen.getByRole("button", { name: /bought/i });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps its rows out of reach while it is shut", () => {
    // A collapsed panel whose rows are still tabbable sends the focus ring into
    // a region nobody can see.
    renderBoard(listOf([item("milk", { completedAt: T })]));
    const panel = document.getElementById("bought-panel");
    expect(panel?.querySelector("ul")?.hasAttribute("inert")).toBe(true);
  });

  it("says it is a window rather than an archive once it is full", () => {
    const many = Array.from({ length: 140 }, (_, index) =>
      item(`thing${index}`, { completedAt: T - index }),
    );
    renderBoard(listOf(many));
    expect(screen.getByText(/the last 100, newest first/i)).toBeTruthy();
  });
});

describe("somebody else's phone", () => {
  it("connects, telling the server what it already has", () => {
    const initial = listOf([item("milk")]);
    renderBoard(initial);

    const url = new URL(stream().url, "https://example.test");
    expect(url.searchParams.get(REVISION_PARAM)).toBe(initial.revision);
  });

  it("shows something added in another room, with no reload", async () => {
    renderBoard(listOf([item("milk")]));

    const pushed = listOf([item("milk"), item("bread", { createdAt: T + 1_000 })]);
    await act(async () => {
      stream().emit("open");
      stream().emit(LIST_EVENT, JSON.stringify(pushed));
    });

    expect(wantedRows().map((text) => text.toLowerCase())).toEqual(["bread", "milk"]);
  });

  it("removes something they deleted", async () => {
    renderBoard(listOf([item("milk"), item("bread")]));

    await act(async () => {
      stream().emit(LIST_EVENT, JSON.stringify(listOf([item("bread")])));
    });

    expect(screen.queryByRole("checkbox", { name: /milk/i })).toBeNull();
  });

  it("ignores a payload it does not understand", async () => {
    renderBoard(listOf([item("milk")]));

    await act(async () => {
      stream().emit(LIST_EVENT, "not a list");
      stream().emit(LIST_EVENT, '{"active":[]}');
    });

    // One bad message must cost the message, not the page.
    expect(screen.getByRole("checkbox", { name: /milk/i })).toBeTruthy();
  });

  it("does not rub out a tick that is still being written", async () => {
    /*
     * The race the whole reconciliation exists for. This phone ticks the milk;
     * before the write lands, the stream pushes a list in which the milk is still
     * wanted — because the poll behind it read a moment too early. The tick must
     * survive.
     */
    let release: (value: { ok: true }) => void = () => {};
    setShoppingItemComplete.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      }),
    );

    renderBoard(listOf([item("milk")]));
    fireEvent.click(rowFor("milk"));
    await afterTheAnimation();

    await act(async () => {
      stream().emit(LIST_EVENT, JSON.stringify(listOf([item("milk")])));
    });
    expect(wantedRows()).toHaveLength(0);

    await act(async () => {
      release({ ok: true });
    });
    expect(wantedRows()).toHaveLength(0);
  });

  it("lets go of the local change once the server agrees", async () => {
    renderBoard(listOf([item("milk")]));
    fireEvent.click(rowFor("milk"));
    await afterTheAnimation();
    await settle();

    const bought = item("milk", { completedAt: T + 100, completedBy: "Dad" });
    await act(async () => {
      stream().emit(LIST_EVENT, JSON.stringify(listOf([bought])));
    });

    fireEvent.click(screen.getByRole("button", { name: /bought/i }));
    expect(screen.getByRole("checkbox", { name: /milk/i }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});

describe("the connection", () => {
  it("says whether it is live", async () => {
    renderBoard();
    expect(screen.getByText("Offline")).toBeTruthy();

    await act(async () => {
      stream().emit("open");
    });
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("opens a fresh connection when one retires, carrying the newer revision", async () => {
    const initial = listOf([item("milk")]);
    renderBoard(initial);

    const pushed = listOf([item("milk"), item("bread", { createdAt: T + 10 })]);
    await act(async () => {
      stream().emit("open");
      stream().emit(LIST_EVENT, JSON.stringify(pushed));
      stream().emit(BYE_EVENT, "{}");
    });

    expect(FakeEventSource.opened).toHaveLength(2);
    const url = new URL(stream().url, "https://example.test");
    expect(url.searchParams.get(REVISION_PARAM)).toBe(pushed.revision);
    expect(FakeEventSource.opened[0].readyState).toBe(FakeEventSource.CLOSED);
  });

  it("closes the stream when the page is hidden, and opens one when it comes back", async () => {
    // An open stream is a server function held open. A phone in a pocket should
    // not be paying for one.
    renderBoard();
    await act(async () => {
      stream().emit("open");
    });

    await act(async () => {
      hide(true);
    });
    expect(FakeEventSource.opened[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(screen.getByText("Offline")).toBeTruthy();

    await act(async () => {
      hide(false);
    });
    expect(FakeEventSource.opened).toHaveLength(2);
    expect(FakeEventSource.opened[1].readyState).not.toBe(FakeEventSource.CLOSED);
  });

  it("hangs up when the page goes away", () => {
    const view = renderBoard();
    const opened = stream();
    view.unmount();
    expect(opened.readyState).toBe(FakeEventSource.CLOSED);
  });
});

/* -------------------------------------------------------------------------- */

function typeAndAdd(text: string) {
  const field = screen.getByLabelText(/add something to the shopping list/i);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.submit(field.closest("form")!);
}

function hide(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
