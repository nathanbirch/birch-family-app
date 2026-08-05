"use client";

import Image from "next/image";

import { getChildren, type ChildId } from "@/config/family";

/**
 * Whose page this is, said with the whole screen.
 *
 * The risk this exists to remove is a real one: five children share one phone,
 * the charts look alike, and a star ticked on the wrong page is a star
 * somebody else did not earn. A selected tab is a 70-pixel answer to a
 * question the child never thought to ask. So the entire background answers it
 * instead — their colour washed across the page, and their own face, twice,
 * large and faint behind the cards.
 *
 * It is deliberately *only* reinforcement. The heading still says "Hannah's
 * Stars" in words, because colour alone must never be the thing carrying the
 * meaning — for a colour-blind reader, and for anyone who has not yet learned
 * that green means Clara.
 *
 * ---------------------------------------------------------------------------
 * WHY ALL FIVE ARE RENDERED AT ONCE
 * ---------------------------------------------------------------------------
 * Every child gets a layer and four of them sit at zero opacity, so switching
 * is a cross-fade between two things already on the screen rather than a new
 * photograph being fetched and decoded. Tapping between charts stays instant,
 * and nobody sees a half-painted face. The five photographs are the same files
 * the tabs above are already showing, so this costs no extra network.
 */
export function ChildBackdrop({ selected }: { selected: ChildId }) {
  return (
    <div
      aria-hidden="true"
      data-child={selected}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {getChildren().map((child) => {
        const isSelected = child.id === selected;
        return (
          <div
            key={child.id}
            className="absolute inset-0 transition-opacity duration-500 ease-out"
            style={{ opacity: isSelected ? 1 : 0 }}
          >
            {/*
              The wash. A gradient rather than a flat fill so the colour is
              strongest at the top, where the child's name and their tab are,
              and fades out under the chart where text has to stay readable.
            */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, ${child.avatarColor}38, ${child.avatarColor}1f 45%, ${child.avatarColor}0f)`,
              }}
            />

            {child.imageSrc ? (
              <>
                <FadedFace
                  child={child.imageSrc}
                  className="-right-16 -top-10 h-64 w-64 sm:-right-10 sm:h-80 sm:w-80"
                />
                <FadedFace
                  child={child.imageSrc}
                  className="-left-20 bottom-24 h-56 w-56 sm:-left-10 sm:h-72 sm:w-72"
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One big, faint copy of the child's photograph.
 *
 * Blurred and held at a tenth of full strength: it should read as *whose* page
 * this is out of the corner of an eye, and never as something to look at. The
 * blur also keeps it from competing with the real avatar on the tab bar.
 */
function FadedFace({
  child,
  className,
}: {
  child: string;
  className: string;
}) {
  return (
    <div className={`absolute overflow-hidden rounded-full opacity-[0.13] blur-[2px] ${className}`}>
      <Image
        src={child}
        alt=""
        fill
        sizes="320px"
        className="rounded-full object-cover"
      />
    </div>
  );
}
