# Family and seats

## The people

All seven live in [`src/config/family.ts`](../src/config/family.ts).

```ts
{
  id: "emily",              // stable key — the schedule refers to this
  name: "Emily",            // what the app displays
  role: "child",
  avatarColor: "#14b8a6",   // identifying colour, never changes with the theme
  avatarColorDark: "#0f766e",
  imageSrc: "/avatars/emily.png",
  face: { hair: "bun", hairColor: "#2f2620", skin: "#e8b48b", accessory: "glasses" },
}
```

| Field | Notes |
|---|---|
| `id` | The stable key. The rotation schedule and the tests refer to it. **Don't change it** when renaming someone. |
| `name` | Free to change. Appears under the avatar and in the screen-reader description. |
| `avatarColor` | The person's identifying colour: the ring and the initial badge. Deliberately independent of the app theme, so a child always recognises themselves. |
| `avatarColorDark` | Darker shade, used for the initial badge and the illustration's gradient. |
| `imageSrc` | Optional. A local path under `public/`. When set, the photo replaces the illustration. |
| `face` | The illustrated fallback, used whenever `imageSrc` is absent. |

`hair` accepts `long`, `wavy`, `bun`, `short`, `curly`, `swoop`, `buzz`.
`accessory` accepts `glasses`, `bow`, `freckles`, or nothing.

### Photos

Everyone currently uses a real photo from `public/avatars/`. To swap one,
replace the file keeping the same name — square images work best, since they
are cropped to a circle.

To go back to the illustrated character for someone, delete their `imageSrc`
line. The `face` definition is still there and takes over immediately; both
paths are covered by tests.

Images must be local. A remote URL would break offline use.

## The two scenes

Both are photographs, not drawings, and both are portrait with the same 2:3
shape — which is what lets them sit side by side on a desktop and match.

| File | Scene |
|---|---|
| `public/scenes/dinner-table.png` | Dinner Table |
| `public/scenes/expedition.png` | Ford Expedition |

They are referenced from `TABLE_LAYOUT` and `VEHICLE_LAYOUT` in
[`src/config/seating.ts`](../src/config/seating.ts), which both read the same
`SCENE_AVATAR_SIZE` and `SCENE_FONT_SIZE` constants.

### Dinner table

The table is photographed with its long axis vertical and a bench down each
side. The parents take the top slot of each bench, directly across from one
another, and the children fill downwards:

```
   left bench        table        right bench

    Parent 1                       Parent 2
   (Sarah)                        (Nathan)
    Child 1                        Child 3
    Child 2                        Child 4
                                   Child 5
```

The left bench seats three, the right seats four. This is the same seven seats
as a landscape view of the table, just turned ninety degrees — who sits beside
whom is unchanged, and so are the adjacency model and the schedule.

Measured against the photo as it is actually rendered: the left bench occupies
x 17–27, the table 30–74, the right bench 77–87, and both benches run y 22–86.
The two columns sit at x 24 and x 80, straddling bench and table edge and
symmetric about the table's centre line. The children's rows are aligned across
the table so seat 1 faces seat 3 and seat 2 faces seat 4.

### Ford Expedition

```
   Driver                 Front passenger
   Child 1    Child 2     Child 3          (second row)
   Child 4                Child 5          (third row)
```

Captain's chairs up front, a three-across second row, and the two outboard
seats of the third row.

### Seat coordinates

Every seat is a percentage of the scene frame: `x` across, `y` down, measured
to the centre of a head. Nothing is in pixels, so the layout holds from a 320px
phone to a wide desktop.

Three tests protect the numbers: no two avatars may overlap, no name label may
collide with the avatar below it, and everything must stay inside the frame.
They compute the real footprints from the layout constants, so they stay true
if you change the avatar size.

## Parents

```ts
export const PARENT_ASSIGNMENTS = {
  table:   { parent1: "sarah", parent2: "nathan" },
  vehicle: { parent1: "sarah", parent2: "nathan" },  // parent1 drives
} as const;
```

This is the **default**: Sarah takes Parent Seat 1 and drives; Nathan takes
Parent Seat 2 and the front passenger seat.

The table and vehicle are configured separately, so you could have one person
drive while the other still takes Parent Seat 1 at dinner.

### Swapping them day to day

The ⇄ button in the header trades the two parents' places in **both** scenes at
once, and the two of them arc across to each other's seats. The children are
never affected.

The choice is saved under `birch-family-seats:parents-swapped:v1`, restored on
reload, and — like the theme — stays on that browser and that device only. To
clear it:

```js
localStorage.removeItem("birch-family-seats:parents-swapped:v1");
```

The button reports its state through `aria-pressed` and a half-turn of the
arrows, never through colour alone.

## Adjacency

The schedule optimiser needs to know which seats are near which. Defined in
`seating.ts`, with two weights:

| Layout | Shoulder-to-shoulder (weight 1) | Across / front-and-behind (weight 0.5) |
|---|---|---|
| Table | (1,2) (3,4) (4,5) | (1,3) (2,4) |
| Expedition | (1,2) (2,3) (4,5) | (1,4) (2,4) (2,5) (3,5) |

Because the two places have different geometry, the same position mapping
produces different sibling relationships in each — which is exactly what makes
the combined fairness picture interesting. See [Rotation](rotation.md).
