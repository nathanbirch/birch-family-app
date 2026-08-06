import type {
  DecorativeIconName,
  NavIconName,
  PlannedIconName,
} from "@/config/navigation";

/**
 * The app's icon set.
 *
 * Line icons on a 24x24 grid, drawn with `currentColor` so they inherit
 * whatever the surrounding element's colour is — active tab, muted card, or
 * anything a future theme introduces. `stroke-width` is uniform so they read
 * as one family.
 */

type IconProps = {
  /** Tailwind sizing classes, e.g. "h-6 w-6". */
  className?: string;
};

const SHARED = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * A dining chair, seen from the side — the seating rotation.
 *
 * This replaced a plate-with-cutlery drawing that, at tab size, read as a
 * target with two horns rather than as anything to do with dinner. A chair is
 * unambiguous at 24px and covers both scenes: you sit down at the table and
 * you sit down in the car.
 */
function SeatsIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      {/*
        Backrest with an OPEN bottom edge, a separate seat slab below it, then
        the legs. The gap between back and seat is what makes this read as a
        chair — closed into a single box, it looks like a table or a doorway.
      */}
      <path d="M7 11.2V5.6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5.6" />
      <rect x="4.9" y="11.4" width="14.2" height="2.8" rx="1.3" />
      <path d="M7.3 14.2v6.3M16.7 14.2v6.3" />
    </svg>
  );
}

/** A house — the dashboard. */
function HomeIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <path d="M3.5 10.5 12 4l8.5 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </svg>
  );
}

/** A person — the account page. */
function AccountIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 19.6a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

/** A checklist — the jobs list, on a mantra card. */
function ChoresIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M8.2 9.2l1.6 1.6 3-3M8.2 15.4l1.6 1.6 3-3" />
      <path d="M14.6 9.2h2.2M14.6 15.4h2.2" />
    </svg>
  );
}

/** A rosette — the weekly celebration report. */
function ReportIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <circle cx="12" cy="9.2" r="5.2" />
      <path d="m9.2 13.6-1.4 6.9 4.2-2.4 4.2 2.4-1.4-6.9" />
    </svg>
  );
}

/** A gift — rewards. */
function RewardsIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
      <path d="M3.5 12.8h17M12 9v11.5" />
      <path d="M12 9C10 9 7.6 8.4 7.6 6.4A2.4 2.4 0 0 1 12 5.6a2.4 2.4 0 0 1 4.4.8C16.4 8.4 14 9 12 9Z" />
    </svg>
  );
}

/** A star — earned stars. */
function StarsIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <path d="m12 3.8 2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 17.1l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85Z" />
    </svg>
  );
}

/** A speech bubble with a heart — family mantras. */
function MantrasIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <path d="M20 12.4c0 3.8-3.6 6.9-8 6.9a9.6 9.6 0 0 1-2.6-.35L5 20.5l1.2-3.1A6.5 6.5 0 0 1 4 12.4C4 8.6 7.6 5.5 12 5.5s8 3.1 8 6.9Z" />
      <path d="M12 15c-1.3-1-2.8-2-2.8-3.4a1.6 1.6 0 0 1 2.8-1 1.6 1.6 0 0 1 2.8 1c0 1.4-1.5 2.4-2.8 3.4Z" />
    </svg>
  );
}

/** A calendar page — the Google Calendar view. */
function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10.2h17M8.5 3.5v4M15.5 3.5v4" />
      <circle cx="8.6" cy="14.2" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.2" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * An apple — the healthy lists.
 *
 * An apple rather than the obvious heart: the mantras icon already has a heart
 * in it, and at this size two hearts on one screen are hard to tell apart. The
 * apple also matches the drawing on the first card of the page it leads to.
 */
function HealthIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <path d="M12 8.4c1.5-1.3 3.7-1.3 5 .1 1.5 1.7 1.2 5-.3 7.5-1 1.6-2.2 2.4-3.2 2.4-.8 0-1-.4-1.5-.4s-.7.4-1.5.4c-1 0-2.2-.8-3.2-2.4-1.5-2.5-1.8-5.8-.3-7.5 1.3-1.4 3.5-1.4 5-.1Z" />
      <path d="M12 8.4c-.6-2-.2-3.5 1-4.5M12.8 6.2c1.4-1.5 3.4-1.6 4.5-.8-.8 1.8-2.8 2.5-4.5.8Z" />
    </svg>
  );
}

/**
 * A lightbulb — the Bored Page.
 *
 * The obvious drawing is a bored face, and it is the wrong one: the card is
 * offering an idea, not sympathy, and a glum face on the dashboard is a small
 * daily suggestion that being bored is a state to sit in. A bulb is what the
 * page actually hands over.
 */
function BoredIcon({ className }: IconProps) {
  return (
    <svg {...SHARED} className={className} aria-hidden="true">
      <path d="M12 3.2a6.3 6.3 0 0 0-3.6 11.5c.6.4.9 1 .9 1.7v.4h5.4v-.4c0-.7.3-1.3.9-1.7A6.3 6.3 0 0 0 12 3.2Z" />
      <path d="M9.7 19.2h4.6M10.4 21.4h3.2" />
    </svg>
  );
}

const ICONS = {
  seats: SeatsIcon,
  health: HealthIcon,
  bored: BoredIcon,
  home: HomeIcon,
  account: AccountIcon,
  report: ReportIcon,
  rewards: RewardsIcon,
  stars: StarsIcon,
  chores: ChoresIcon,
  mantras: MantrasIcon,
  calendar: CalendarIcon,
} satisfies Record<
  NavIconName | PlannedIconName | DecorativeIconName,
  (props: IconProps) => React.JSX.Element
>;

export function NavIcon({
  name,
  className = "h-6 w-6",
}: {
  name: NavIconName | PlannedIconName | DecorativeIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
