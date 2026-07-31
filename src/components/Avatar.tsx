import Image from "next/image";

import { initialOf, type AvatarFace, type FamilyMember } from "@/config/family";

/**
 * A family member in their seat.
 *
 * Renders the local photo from `imageSrc` when one is configured, and falls
 * back to a fully illustrated character built from inline SVG when it is not.
 * Either way nothing is loaded from the network, so seats render offline.
 *
 * The person's identifying colour comes from the family config and never
 * changes with the app theme; only the surrounding ring picks up theme colour.
 */

type AvatarProps = {
  member: FamilyMember;
  /** Rendered under the portrait. Defaults to the person's first name. */
  showName?: boolean;
  /**
   * Start the walk-in. Held back until every photograph in the scene has
   * loaded, so nobody crosses the room as an empty circle — see
   * `hooks/useImagesReady.ts`.
   */
  arriving?: boolean;
};

export function Avatar({ member, showName = true, arriving = false }: AvatarProps) {
  return (
    // `w-full` matters: it pins the avatar to the seat's configured size. Left
    // to shrink-to-fit, the circle would be sized by the name label beneath it
    // and William would end up with a visibly bigger face than Clara.
    //
    // The arrival animation lives here; the timing variables it reads are set
    // by `<Seat>`.
    <div
      className={`seat-arrival${arriving ? " is-arriving" : ""} flex w-full flex-col items-center gap-[0.35em] leading-none`}
    >
      <div
        className="relative aspect-square w-full rounded-full"
        style={{
          // Themed ring outside, surface-coloured gap inside, so the avatar
          // reads clearly against wood, upholstery or a dark cabin.
          boxShadow:
            "0 0 0 0.14em var(--color-surface), 0 0 0 0.24em var(--color-primary), 0 0.12em 0.3em var(--color-shadow)",
          backgroundColor: member.avatarColor,
        }}
      >
        {member.imageSrc ? (
          /*
           * `priority`: these are the point of the page and sit above the
           * fold, so Next emits a preload link and fetches them eagerly at
           * high priority rather than lazily. Only seven distinct files, a few
           * KB each once the optimiser has served them as WebP — and the
           * arrival animation waits on them, so fetching them late would delay
           * the whole scene.
           */
          <Image
            src={member.imageSrc}
            alt=""
            fill
            sizes="(min-width: 1024px) 140px, 90px"
            className="rounded-full object-cover"
            priority
          />
        ) : (
          <FaceIllustration
            face={member.face}
            color={member.avatarColor}
            colorDark={member.avatarColorDark}
          />
        )}

        {/* First-initial badge — a second, non-colour way to tell people apart. */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 flex aspect-square w-[34%] items-center justify-center rounded-full font-bold"
          style={{
            backgroundColor: member.avatarColorDark,
            color: "#ffffff",
            boxShadow: "0 0 0 0.1em var(--color-surface)",
            fontSize: "0.8em",
          }}
        >
          {initialOf(member)}
        </span>
      </div>

      {showName ? (
        // Allowed to be wider than the avatar and overflow evenly to each
        // side; the seat spacing in `config/seating.ts` leaves room for it.
        <span
          className="whitespace-nowrap rounded-full px-[0.6em] py-[0.15em] text-center font-semibold"
          style={{
            fontSize: "0.92em",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
        >
          {member.name}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Illustration                                                        */
/* ------------------------------------------------------------------ */

function FaceIllustration({
  face,
  color,
  colorDark,
}: {
  face: AvatarFace;
  color: string;
  colorDark: string;
}) {
  const gradientId = `av-${color.replace("#", "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full rounded-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="28%" r="78%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={colorDark} />
        </radialGradient>
        <clipPath id={`${gradientId}-clip`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${gradientId}-clip)`}>
        <circle cx="32" cy="32" r="32" fill={`url(#${gradientId})`} />
        {/* Shoulders, so the character reads as a person rather than a head. */}
        <ellipse cx="32" cy="70" rx="26" ry="20" fill="#ffffff" opacity="0.28" />

        <HairBack face={face} />
        {/* Ears */}
        <circle cx="15.5" cy="35" r="4" fill={face.skin} />
        <circle cx="48.5" cy="35" r="4" fill={face.skin} />
        {/* Head */}
        <ellipse cx="32" cy="33" rx="17" ry="18.5" fill={face.skin} />
        <HairFront face={face} />

        {/* Eyes */}
        <ellipse cx="25.5" cy="32" rx="2.3" ry="2.9" fill="#33261f" />
        <ellipse cx="38.5" cy="32" rx="2.3" ry="2.9" fill="#33261f" />
        <circle cx="26.3" cy="31" r="0.85" fill="#ffffff" />
        <circle cx="39.3" cy="31" r="0.85" fill="#ffffff" />

        {/* Cheeks */}
        <ellipse cx="21.5" cy="38.5" rx="3.2" ry="2.2" fill="#f08a8a" opacity="0.35" />
        <ellipse cx="42.5" cy="38.5" rx="3.2" ry="2.2" fill="#f08a8a" opacity="0.35" />

        {/* Smile */}
        <path
          d="M25.5 40.5 Q32 46.5 38.5 40.5"
          fill="none"
          stroke="#8a4a3c"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <Accessory face={face} />
      </g>
    </svg>
  );
}

function HairBack({ face }: { face: AvatarFace }) {
  const { hair, hairColor } = face;

  switch (hair) {
    case "long":
      return (
        <path
          d="M12 34 Q12 12 32 12 Q52 12 52 34 L52 58 Q46 52 44 58 L20 58 Q18 52 12 58 Z"
          fill={hairColor}
        />
      );
    case "wavy":
      return (
        <path
          d="M13 34 Q13 12 32 12 Q51 12 51 34 Q51 46 47 52 Q44 46 41 52 L23 52 Q20 46 17 52 Q13 46 13 34 Z"
          fill={hairColor}
        />
      );
    case "curly":
      return (
        <g fill={hairColor}>
          <circle cx="18" cy="26" r="8" />
          <circle cx="32" cy="18" r="9.5" />
          <circle cx="46" cy="26" r="8" />
          <circle cx="15" cy="38" r="6.5" />
          <circle cx="49" cy="38" r="6.5" />
        </g>
      );
    case "bun":
      return (
        <g fill={hairColor}>
          <circle cx="32" cy="11" r="7" />
          <path d="M14 34 Q14 14 32 14 Q50 14 50 34 Q50 40 47 44 L17 44 Q14 40 14 34 Z" />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ face }: { face: AvatarFace }) {
  const { hair, hairColor } = face;

  switch (hair) {
    case "long":
    case "wavy":
      return (
        <path
          d="M15 30 Q17 15 32 15 Q47 15 49 30 Q42 22 32 22 Q22 22 15 30 Z"
          fill={hairColor}
        />
      );
    case "bun":
      return (
        <path
          d="M15.5 30 Q18 16 32 16 Q46 16 48.5 30 Q41 23 32 23 Q23 23 15.5 30 Z"
          fill={hairColor}
        />
      );
    case "curly":
      return (
        <path
          d="M16 30 Q19 18 32 18 Q45 18 48 30 Q41 24 32 24 Q23 24 16 30 Z"
          fill={hairColor}
        />
      );
    case "short":
      return (
        <path
          d="M15 31 Q16 14 32 14 Q48 14 49 31 Q45 22 32 22 Q19 22 15 31 Z"
          fill={hairColor}
        />
      );
    case "swoop":
      return (
        <path
          d="M15 31 Q15 14 32 14 Q49 14 49 29 Q44 20 30 23 Q22 25 15 31 Z"
          fill={hairColor}
        />
      );
    case "buzz":
      return (
        <path
          d="M16 30 Q17 17 32 17 Q47 17 48 30 Q44 24 32 24 Q20 24 16 30 Z"
          fill={hairColor}
        />
      );
    default:
      return null;
  }
}

function Accessory({ face }: { face: AvatarFace }) {
  switch (face.accessory) {
    case "glasses":
      return (
        <g fill="none" stroke="#3f3a36" strokeWidth="1.6">
          <circle cx="25.5" cy="32" r="6" fill="#ffffff" fillOpacity="0.22" />
          <circle cx="38.5" cy="32" r="6" fill="#ffffff" fillOpacity="0.22" />
          <path d="M31.5 32 H32.5" strokeLinecap="round" />
          <path d="M19.5 31 L16 30.5" strokeLinecap="round" />
          <path d="M44.5 31 L48 30.5" strokeLinecap="round" />
        </g>
      );
    case "bow":
      return (
        <g transform="translate(45 15)">
          <path d="M0 0 L-7 -4 L-7 4 Z" fill="#ffffff" opacity="0.95" />
          <path d="M0 0 L7 -4 L7 4 Z" fill="#ffffff" opacity="0.95" />
          <circle cx="0" cy="0" r="2.4" fill="#ffffff" />
        </g>
      );
    case "freckles":
      return (
        <g fill="#b9724f" opacity="0.65">
          <circle cx="22.5" cy="36.5" r="0.85" />
          <circle cx="25.5" cy="38" r="0.85" />
          <circle cx="41.5" cy="36.5" r="0.85" />
          <circle cx="38.5" cy="38" r="0.85" />
        </g>
      );
    default:
      return null;
  }
}
