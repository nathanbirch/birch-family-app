# School

Lunch menus, permission slips, class handouts — anything that comes home from
school as a single page worth keeping. Lives at
[`/school`](../src/app/(app)/school/page.tsx), which shows whatever applies to
everyone and then a face per child, and
[`/school/[childId]`](<../src/app/(app)/school/[childId]/page.tsx>), a card list
of that child's documents.

Modelled on [Health](health.md): a plain compiled-in list, not a database
collection. A document is added the way a photo is taken — one at a time, off
a phone — not the way a coin balance changes on its own, so there is no admin
UI and no `documents` collection in Mongo.

## What lives where

| | Where |
|---|---|
| Title, description, which children it applies to | [`src/config/documents.ts`](../src/config/documents.ts) |
| The original photograph | `assets/documents/<id>.jpg` (not shipped — see below) |
| The optimised full view and thumbnail | `public/documents/*.jpg`, generated |
| The generated filename → dimensions lookup | [`src/config/document-manifest.ts`](../src/config/document-manifest.ts), generated |
| The card, and the full-screen pan/zoom viewer | [`src/components/school/`](../src/components/school/) |

A child's face on `/school` only links anywhere once
`documentsForChild(id)` is non-empty — see
[`ChildFace`](../src/components/school/ChildFace.tsx). There is nothing to land
on for a child with nothing on file, so the face is drawn desaturated and
inert instead of pointing at an empty page.

## Adding a document

1. Take or find the photograph. Straighten and crop it in the Photos app first
   if it is crooked or has a lot of background around the page — the
   optimiser resizes but does not straighten.
2. Save it as `assets/documents/<id>.jpg`, where `<id>` is a short kebab-case
   name you're happy to see in a URL segment forever (it becomes the key in
   the generated manifest).
3. `npm run documents:generate`. This resizes it to a 1600px-long-edge full
   view and a 360px-wide thumbnail, content-hashes both, writes them to
   `public/documents/`, and regenerates `document-manifest.ts`.
4. Add an entry to `SCHOOL_DOCUMENTS` in `src/config/documents.ts`: the same
   `id`, a title, a one-line description for the card, and `childIds` — an
   array of ids from `src/config/family.ts`, or `"all"` for something that
   applies to every child (not every family member — a permission slip is
   never really about the parents).

Replacing a photo already on file is the same as adding one: overwrite the
file at the same `assets/documents/<id>.jpg` path, re-run the generator, and
nothing else needs to change — the id stays put, only the hash in the
manifest does.

## Why the optimiser shells out to `sips`

Every other image script in this repo (`optimise-avatars.mjs`,
`optimise-pets.mjs`, `generate-icons.mjs`) decodes and re-encodes PNG by hand
with Node's zlib — no image library, no network — because those masters are
all PNG, a format simple enough to hand-roll. These masters are JPEG
photographs of printed pages. Writing a JPEG codec from scratch to keep the
same purity would be a project on its own, so `scripts/optimise-documents.mjs`
shells out to `sips`, the resize/re-encode tool that ships with macOS — the
same machine these photos are taken on and dropped into `assets/documents/`
from. It is the one script in this folder that only runs on a Mac, and it only
ever needs to: masters are replaced by a developer's hand, the same way an
avatar or pet photo is.

## Why the mastered photo isn't the file the app serves

Three reasons, identical to the avatars — see the top of
`optimise-avatars.mjs` for the fuller argument:

1. **Size.** A phone photo of a printed page is several megabytes at native
   resolution to render inside a card a few hundred pixels wide.
2. **Unguessable names.** The generated filename carries a content hash, so
   `/documents/mms-lunch-menu.jpg` is never a real, sittable-on-a-bookmark
   URL — see `docs/authentication.md`.
3. **Caching.** The hash changes only when the photo does, which is what lets
   `next.config.ts` serve these `immutable` for a year.

## The viewer

`DocumentViewer` is a full-screen pan/zoom overlay with no library behind it —
matching the rest of this project's "no dependency for something the Pointer
Events API already does" stance (see `FingerPicker` for the same call made
about multi-touch). A single `translate() scale()` on the image is driven by
tracking every active pointer in a `Map`; a second pointer appearing starts a
pinch, one pointer moving pans, the wheel zooms on a trackpad or mouse, and a
double-tap/double-click zooms in on the tapped spot or resets if already
zoomed.
