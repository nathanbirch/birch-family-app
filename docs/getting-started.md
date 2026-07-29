# Getting started

Requires **Node 20 or newer**. No other tooling, no services to sign up for.

```bash
npm install
npm run dev        # http://localhost:3000
```

## Every script

| Script | What it does |
|---|---|
| `npm run dev` | Development server. Fast refresh; the service worker is deliberately **not** registered here. |
| `npm run build` | Production build. Also runs a full TypeScript check. |
| `npm start` | Serves the production build. Use this to test PWA and offline behaviour. |
| `npm run lint` | ESLint, using `eslint-config-next`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | The whole test suite, once. |
| `npm run test:watch` | Tests in watch mode while you work. |
| `npm run test:coverage` | Tests plus a coverage report. |
| `npm run check` | `typecheck` → `lint` → `test`. Run this before you commit. |
| `npm run schedule:generate` | Development only. Searches every possible five-week schedule and prints the best, with fairness statistics. |
| `npm run icons:generate` | Development only. Redraws the PWA icons into `public/icons/`. |

## The one thing that will confuse you

`npm run dev` does not register the service worker, so **offline behaviour
cannot be tested in dev**. That is on purpose — a cache sitting in front of the
dev server's constantly-changing assets causes nothing but confusion. To test
offline:

```bash
npm run build && npm start
```

then use DevTools → Network → **Offline** and reload.

## Project layout

```
docs/          you are here
public/
  avatars/     one photo per family member
  scenes/      the dinner table and Expedition photographs
  icons/       generated PWA icons
  sw.js        the offline service worker
scripts/       development-only utilities
src/
  app/         routes, layout, global CSS, manifest
  components/  everything rendered
  config/      all the data: family, seats, rotation, themes
  hooks/       the two client-side hooks
  lib/         pure logic: dates, rotation, storage
tests/         the test suite
```

See [Architecture](architecture.md) for what lives where and why.
