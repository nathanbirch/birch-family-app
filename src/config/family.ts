/**
 * The family roster.
 *
 * Everything the app knows about people lives here: names, roles, identifying
 * avatar colours and (optionally) a local avatar photo.
 *
 * To rename someone, change `name` only — the `id` is a stable key used by the
 * rotation schedule and should not change.
 */

export type PersonId =
  | "nathan"
  | "sarah"
  | "hannah"
  | "emily"
  | "clara"
  | "william"
  | "james";

export type FamilyMember = {
  id: PersonId;
  name: string;
  role: "parent" | "child";
  /**
   * The person's identifying colour. This never changes with the app theme —
   * it is how everyone recognises themselves at a glance.
   */
  avatarColor: string;
  /** Darker shade of `avatarColor`, used for the avatar ring and text. */
  avatarColorDark: string;
  /**
   * Optional path to a *local* image in `public/` (e.g. `/avatars/emily.jpg`).
   * When set, the photo replaces the illustrated avatar.
   */
  imageSrc?: string;
  /** Illustration traits — see `components/Avatar.tsx`. */
  face: AvatarFace;
};

export type AvatarFace = {
  /** Hair silhouette drawn behind/around the face. */
  hair: "long" | "wavy" | "bun" | "short" | "curly" | "swoop" | "buzz";
  hairColor: string;
  skin: string;
  /** Small personality detail. */
  accessory?: "glasses" | "bow" | "freckles";
};

export const FAMILY: readonly FamilyMember[] = [
  {
    id: "nathan",
    name: "Nathan",
    role: "parent",
    avatarColor: "#3b82f6",
    avatarColorDark: "#1d4ed8",
    imageSrc: "/avatars/nathan.png",
    face: { hair: "short", hairColor: "#3f2d22", skin: "#f2c9a4" },
  },
  {
    id: "sarah",
    name: "Sarah",
    role: "parent",
    avatarColor: "#fb7185",
    avatarColorDark: "#be123c",
    imageSrc: "/avatars/sarah.png",
    face: { hair: "wavy", hairColor: "#6b3f22", skin: "#f6d5b6" },
  },
  {
    id: "hannah",
    name: "Hannah",
    role: "child",
    avatarColor: "#a855f7",
    avatarColorDark: "#7e22ce",
    imageSrc: "/avatars/hannah.png",
    face: { hair: "long", hairColor: "#4a2f1d", skin: "#f6d5b6" },
  },
  {
    id: "emily",
    name: "Emily",
    role: "child",
    avatarColor: "#14b8a6",
    avatarColorDark: "#0f766e",
    imageSrc: "/avatars/emily.png",
    face: { hair: "bun", hairColor: "#2f2620", skin: "#e8b48b", accessory: "glasses" },
  },
  {
    id: "clara",
    name: "Clara",
    role: "child",
    avatarColor: "#ec4899",
    avatarColorDark: "#be185d",
    imageSrc: "/avatars/clara.png",
    face: { hair: "curly", hairColor: "#8a5522", skin: "#f7dcc2", accessory: "bow" },
  },
  {
    id: "william",
    name: "William",
    role: "child",
    avatarColor: "#22c55e",
    avatarColorDark: "#15803d",
    imageSrc: "/avatars/william.png",
    face: { hair: "swoop", hairColor: "#c98b3c", skin: "#f4cda6", accessory: "freckles" },
  },
  {
    id: "james",
    name: "James",
    role: "child",
    avatarColor: "#f97316",
    avatarColorDark: "#c2410c",
    imageSrc: "/avatars/james.png",
    face: { hair: "buzz", hairColor: "#4a3526", skin: "#e0a877" },
  },
] as const;

export type ChildId = "hannah" | "emily" | "clara" | "william" | "james";

/** The five children, in roster order. Used by the schedule validator. */
export const CHILD_IDS: readonly ChildId[] = [
  "hannah",
  "emily",
  "clara",
  "william",
  "james",
] as const;

const BY_ID = new Map(FAMILY.map((member) => [member.id, member]));

/**
 * Look up a family member by id. Throws during development if the roster and
 * the schedule/seat configuration have drifted apart.
 */
export function getPerson(id: PersonId): FamilyMember {
  const person = BY_ID.get(id);
  if (!person) {
    throw new Error(`Unknown family member id: "${id}". Check config/family.ts.`);
  }
  return person;
}

export function getChildren(): FamilyMember[] {
  return FAMILY.filter((member) => member.role === "child");
}

/** First initial, used on the avatar illustration. */
export function initialOf(member: FamilyMember): string {
  return member.name.charAt(0).toUpperCase();
}
