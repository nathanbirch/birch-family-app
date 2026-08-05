"use client";

import Image from "next/image";

import { getPerson, type FamilyMember } from "@/config/family";
import { PARENT_ASSIGNMENTS } from "@/config/seating";

const PARENT_1 = getPerson(PARENT_ASSIGNMENTS.table.parent1);
const PARENT_2 = getPerson(PARENT_ASSIGNMENTS.table.parent2);

/**
 * Trades the two parents' seats, in both scenes at once.
 *
 * The arrows rotate a half turn to show the current state, so it never relies
 * on colour alone, and `aria-pressed` says the same thing to a screen reader.
 */
export function SwapParentsButton({
  swapped,
  onToggle,
}: {
  swapped: boolean;
  onToggle: () => void;
}) {
  const label = swapped
    ? `${PARENT_2.name} and ${PARENT_1.name} are swapped. Put them back in their usual seats.`
    : `Swap ${PARENT_1.name} and ${PARENT_2.name}'s seats.`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={swapped}
      title={label}
      className="themed-transition flex h-11 min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold sm:px-4"
      style={{
        backgroundColor: swapped ? "var(--color-primary)" : "var(--color-surface)",
        color: swapped ? "var(--color-on-primary)" : "var(--color-text)",
        border: swapped
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        boxShadow: "0 1px 2px var(--color-shadow)",
      }}
    >
      <SwapIcon swapped={swapped} />
      {/*
        The two faces stand in for the word "Swap". Same breakpoint the word
        had, so the button is the width it always was on a phone — the pair is
        within a couple of pixels of the text it replaced.
      */}
      <span className="hidden sm:flex sm:items-center">
        <ParentFace member={PARENT_1} />
        <ParentFace member={PARENT_2} overlapping />
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Diameter of the photograph itself, before the ring around it. */
const FACE_SIZE = 20;

/**
 * How far the second face tucks under the first.
 *
 * Chosen for two reasons at once. It is a light overlap, so the pair reads as
 * two people rather than one obscuring the other — and it keeps the button the
 * width it was. The pair occupies `2 × 20 − 6 = 34px` of layout, against
 * roughly 37px for the word "Swap" it replaced, so the button moves by about
 * three pixels rather than resizing noticeably. The rings sit in `box-shadow`
 * and take no layout width at all, which is what closes the last of that gap
 * visually.
 */
const FACE_OVERLAP = 6;

/**
 * One parent, as they appear in their seat — shrunk to fit a button.
 *
 * Deliberately not `<Avatar>`. That component carries a name label, an initial
 * badge and the arrival animation, all of which are meaningless at 20px; what
 * carries over is the ring, so the faces here read as the same two people
 * sitting at the table and in the Expedition below.
 *
 * The ring is the same two-layer treatment `<Avatar>` uses — a surface-coloured
 * gap inside a themed primary ring — which happens to survive both button
 * states without any conditional colour. Unpressed, the button is `surface` so
 * the gap vanishes and the primary ring reads; pressed, it is `primary` so the
 * ring vanishes and the gap reads as a light outline. Either way there is
 * exactly one visible edge separating each face from the button.
 */
function ParentFace({
  member,
  overlapping = false,
}: {
  member: FamilyMember;
  /** Tucked under the previous face, so the pair reads as a pair. */
  overlapping?: boolean;
}) {
  return (
    <span
      className="relative block shrink-0 rounded-full"
      style={{
        width: FACE_SIZE,
        height: FACE_SIZE,
        backgroundColor: member.avatarColor,
        boxShadow:
          "0 0 0 1px var(--color-surface), 0 0 0 2px var(--color-primary)",
        marginLeft: overlapping ? -FACE_OVERLAP : 0,
        // The leftmost face sits on top, the usual way a stack of avatars is
        // drawn — and it keeps the overlap reading as depth rather than as a
        // clipped circle.
        zIndex: overlapping ? 0 : 1,
      }}
    >
      {member.imageSrc ? (
        <Image
          src={member.imageSrc}
          alt=""
          width={FACE_SIZE}
          height={FACE_SIZE}
          className="h-full w-full rounded-full object-cover"
        />
      ) : null}
    </span>
  );
}

function SwapIcon({ swapped }: { swapped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      style={{
        transform: swapped ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 420ms cubic-bezier(0.34, 1.28, 0.64, 1)",
      }}
    >
      <path
        d="M4 9h13l-3.2-3.2M20 15H7l3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
