import Image from "next/image";

import { initialOf, type FamilyMember } from "@/config/family";

/**
 * A small round face for the Meals page's "who likes it" row.
 *
 * Not `<Avatar>`: that one belongs to the seating scenes, starts invisible
 * until its walk-in animation is triggered, and sizes itself to its seat. This
 * is a plain 40px photo — or the person's colour and initial when there is no
 * photo — that is simply there.
 */
export function PersonFace({
  member,
  className = "h-10 w-10",
}: {
  member: FamilyMember;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-extrabold text-white ${className}`}
      style={{
        backgroundColor: member.avatarColor,
        boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${member.avatarColorDark}`,
      }}
      aria-hidden="true"
    >
      {member.imageSrc ? (
        <Image src={member.imageSrc} alt="" fill sizes="40px" className="object-cover" />
      ) : (
        initialOf(member)
      )}
    </span>
  );
}
