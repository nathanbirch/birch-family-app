import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar } from "@/components/Avatar";
import {
  FAMILY,
  getPerson,
  initialOf,
  type AvatarFace,
  type FamilyMember,
} from "@/config/family";

const HAIR_STYLES: AvatarFace["hair"][] = [
  "long",
  "wavy",
  "bun",
  "short",
  "curly",
  "swoop",
  "buzz",
];

const ACCESSORIES: Array<AvatarFace["accessory"]> = [
  "glasses",
  "bow",
  "freckles",
  undefined,
];

/** A member with no photo, so the illustrated fallback is used. */
function illustrated(overrides: Partial<AvatarFace> = {}): FamilyMember {
  const base = getPerson("emily");
  return {
    ...base,
    imageSrc: undefined,
    face: { ...base.face, ...overrides },
  };
}

describe("Avatar with a photo", () => {
  it("uses the local photo when one is configured", () => {
    const { container } = render(<Avatar member={getPerson("emily")} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).not.toMatch(/^https?:/);
    // The illustration is not drawn as well.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("leaves the photo out of the accessible name", () => {
    const { container } = render(<Avatar member={getPerson("emily")} />);
    // The seating description carries the meaning; the picture is decorative.
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("");
  });
});

describe("Avatar without a photo", () => {
  it("falls back to the illustrated character", () => {
    const { container } = render(<Avatar member={illustrated()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws every configured hair style without failing", () => {
    for (const hair of HAIR_STYLES) {
      const view = render(<Avatar member={illustrated({ hair })} />);
      const svg = view.container.querySelector("svg");
      expect(svg, hair).not.toBeNull();
      // A face is always drawn: two eyes and a mouth at minimum.
      expect(svg!.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(3);
      view.unmount();
    }
  });

  it("draws every accessory option without failing", () => {
    for (const accessory of ACCESSORIES) {
      const view = render(<Avatar member={illustrated({ accessory })} />);
      expect(view.container.querySelector("svg"), String(accessory)).not.toBeNull();
      view.unmount();
    }
  });

  it("uses the person's identifying colours, not the theme's", () => {
    const member = illustrated();
    const { container } = render(<Avatar member={member} />);
    const markup = container.innerHTML;
    expect(markup).toContain(member.avatarColor);
    expect(markup).toContain(member.avatarColorDark);
  });

  it("keeps gradient ids unique so two avatars cannot collide", () => {
    const { container } = render(
      <>
        <Avatar member={illustrated()} />
        <Avatar member={{ ...illustrated(), id: "clara", name: "Clara", avatarColor: "#ec4899" }} />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map((n) =>
      n.getAttribute("id"),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Avatar labelling", () => {
  it("shows the person's name by default", () => {
    render(<Avatar member={getPerson("william")} />);
    expect(screen.getByText("William")).toBeTruthy();
  });

  it("can be rendered without a name", () => {
    const { container } = render(
      <Avatar member={getPerson("william")} showName={false} />,
    );
    expect(within(container).queryByText("William")).toBeNull();
  });

  it("badges everyone with their first initial", () => {
    for (const member of FAMILY) {
      const view = render(<Avatar member={member} showName={false} />);
      expect(view.container.textContent, member.name).toBe(initialOf(member));
      view.unmount();
    }
  });

  it("never lets the name label resize the portrait", () => {
    // The circle is pinned to the seat width; only the label may overflow.
    const short = render(<Avatar member={getPerson("emily")} />);
    const shortClass = short.container
      .querySelector(".aspect-square")!
      .className;
    short.unmount();

    const long = render(<Avatar member={getPerson("william")} />);
    const longClass = long.container.querySelector(".aspect-square")!.className;

    expect(shortClass).toBe(longClass);
    expect(shortClass).toContain("w-full");
  });

  it("waits for the photographs before playing the walk-in", () => {
    /*
     * `.seat-arrival` is always present; `.is-arriving` is what actually
     * starts the animation, and it only appears once every photograph in the
     * scene has loaded. Otherwise people cross the room as empty circles that
     * fill in after they have sat down.
     */
    const waiting = render(<Avatar member={getPerson("james")} />);
    expect(waiting.container.querySelector(".seat-arrival")).not.toBeNull();
    expect(waiting.container.querySelector(".is-arriving")).toBeNull();

    const arrived = render(<Avatar member={getPerson("james")} arriving />);
    expect(arrived.container.querySelector(".seat-arrival.is-arriving")).not.toBeNull();
  });
});
