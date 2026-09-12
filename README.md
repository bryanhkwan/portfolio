# Bryan Kwan — Sports analytics & data products

An interactive portfolio with CourtVision's Midnight Blue and Rocket Gold visual language. The homepage centers on an original Three.js x-ray study of Savage Arena, inspired by Bryan's photograph. Built with Astro, TypeScript, selective React components, Three.js, and GSAP. Case-study content ships as static HTML.

**Live:** https://bryanhkwan.github.io/portfolio/

## Local development

Use Node 24 and npm. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro, followed by `/portfolio/`. The homepage source is now `src/pages/index.astro`; the former root `index.html` has been replaced by the Astro build.

## Structure

- `src/pages/` — homepage, project index, four case studies, research, about, and 404.
- `src/components/ScoutingLab.tsx` — roster priorities and an interactive shot profile.
- `src/components/SavageArena.tsx` — the arena hero, accessible camera/layer controls, and a server-rendered illustration for loading, no-JavaScript, and WebGL fallback states.
- `src/lib/arena/` — procedural arena geometry, a dynamically loaded Three.js renderer, a single-draw cloud bank, and a shader-based scanline glitch. Approximately 4,500 instanced seats, exposed trusses, a suspended scoreboard, hoops, and an illustrative movement layer; no external model or texture requests.
- `src/assets/toledo-rocket.svg` — the official gold rocket paths, drawn synchronously onto the center-court texture; source attribution is included in the SVG.
- `src/styles/arena.css` — homepage architectural art direction, responsive scene framing, and interaction controls.
- `src/components/CourtReplay.tsx` — a public illustrative court walkthrough, with playback, scrubbing, movement history, shot locations, and temporary teaching-moment markers.
- `src/data/` — project metadata and clearly labeled fictional scouting examples.
- `src/styles/constellation.css` — the active navy/gold design system and responsive product interfaces; shared layout primitives remain in the other stylesheets.
- `src/layouts/SiteLayout.astro` — shared navigation, metadata, contact, and footer.
- `public/` — downloadable documents, aggregate figures, and previously published CourtVision media.
- `tests/` — scoring tests and browser/accessibility checks.

Old `projects.html`, `computer-vision.html`, and `proof.html` URLs redirect to their replacements, preserving relevant anchors. All internal links and assets support GitHub Pages' `/portfolio/` base path.

## Verification

```sh
npm run test:unit
npm run build
npx playwright install chromium
npm test
```

Browser tests use installed Google Chrome locally and Playwright Chromium in CI. They cover desktop and mobile routes, rendered arena camera/layer changes, dragging, reduced-motion idle/play/pause behavior, WebGL failure, replay controls and offscreen pausing, temporary moment markers, ranking changes, shot controls, project filters, document links, keyboard navigation, automated accessibility, narrow layouts, and no-JavaScript fallbacks. Set `TEST_BASE_URL` to `https://bryanhkwan.github.io/portfolio/` to test the published site instead of starting a local preview.

The arena rotates clockwise above a drifting cyan cloud bank. Dragging and control actions suspend rotation; after three idle seconds the camera and arena return to the default view, preserving the selected layers. Hovering does not interrupt rotation. A brief scanline glitch repeats every six active seconds. Pause effects freezes the ambient animation independently of the illustrative movement playback. Reduced-motion visitors see a clear explanation and a Start animation button on the scene. Starting or resuming effects takes effect immediately, and the explicit choice is remembered in local storage when available. A new device request for reduced motion pauses effects again. All rendering stops offscreen and in hidden tabs; movement playback stays paused when returning. Continuous effects use paced frames to leave time for input on software WebGL renderers.

Mouse-wheel scrolling remains page scrolling; touch visitors opt into dragging. Camera presets and rotation buttons provide alternatives to dragging. The arena is an artistic reconstruction, not a measured digital twin, and the movement layer is fictional. The reference photo and stock reference image are not distributed with the site. Browser motion checks also cover clockwise rendered movement, paused cloud stability, glitch cadence, held dragging, the three-second idle return, and layer preservation.

## Publishing

`.github/workflows/deploy.yml` installs locked dependencies, runs unit tests, checks types, builds the site, and runs browser tests before deploying `dist/` to GitHub Pages on pushes to `main`. Pull requests run the checks without publishing. GitHub Pages must use **GitHub Actions** as its build source.

The `site` and `base` settings in `astro.config.mjs` target this repository's existing public URL. Change both when moving domains or repositories.

## Content and media

The court walkthrough and scouting exercise use fictional players and authored illustrative data. The walkthrough is a small portfolio interaction, not the private CourtVision runtime or a recording of team evidence. Playback begins only on request and pauses when hidden or offscreen. Moment markers last for the current component session.

CourtVision's case study reflects the current hosted coaching platform: film, source-synchronized replay, player context, coach-board tools, exports, and private delivery. Its model and reconstruction limitations remain explicit. Historical basketball results are limited to the documented three-game sample. The Astros exercise shows observational associations, not an achieved revenue increase or a client engagement.

Only aggregate Astros/research figures are included; respondent-level case data is not published. Earlier CourtVision assets retain their public URLs for compatibility but are no longer used in the showcase. Current team footage, identities, private packages, credentials, and source remain private. The portal link leads to the approved-coach sign-in page. Existing resume, recommendation, and validation PDF URLs still work. Fonts are served locally.

The previous HTML/CSS/JS files and original asset copies were preserved locally in the ignored `.local-backup/pre-courtside/` directory during migration. Private project inventory and concept exploration files are also excluded from publication.
