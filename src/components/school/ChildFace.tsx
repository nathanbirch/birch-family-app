import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import type { FamilyMember } from "@/config/family";

/**
 * One child's face in the school page's roster.
 *
 * Active (documents on file) is a real link with the child's own colours;
 * inactive is desaturated and inert — `<span>`, not `<Link>`, so there is
 * nothing to tap into an empty page. The face itself never changes shape
 * between the two states, only its vividness, so a child scanning the row
 * still recognises everyone at a glance.
 */
export function ChildFace({
  member,
  active,
  documentCount,
}: {
  member: FamilyMember;
  active: boolean;
  documentCount: number;
}) {
  const face = (
    <span className="flex flex-col items-center gap-1.5">
      <span
        className="block w-16 sm:w-20"
        style={{
          opacity: active ? 1 : 0.38,
          filter: active ? "none" : "grayscale(0.6)",
        }}
      >
        <Avatar member={member} showName={false} arriving />
      </span>
      <span
        className="text-xs font-bold"
        style={{ color: active ? "var(--color-text)" : "var(--color-text-muted)" }}
      >
        {member.name}
      </span>
      <span
        className="text-[0.65rem] font-semibold"
        style={{ color: active ? member.avatarColorDark : "var(--color-text-muted)" }}
      >
        {active
          ? `${documentCount} document${documentCount === 1 ? "" : "s"}`
          : "Nothing yet"}
      </span>
    </span>
  );

  if (!active) {
    return (
      <span className="flex flex-col items-center" aria-disabled="true">
        {face}
      </span>
    );
  }

  return (
    <Link
      href={`/school/${member.id}`}
      className="flex flex-col items-center transition-transform active:scale-95"
    >
      {face}
    </Link>
  );
}
