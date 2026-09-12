# Bryan Kwan — Sports analytics & data products

An interactive portfolio with CourtVision's Midnight Blue and Rocket Gold visual language. Home Court is an immersive portfolio journey through an original Three.js x-ray study of Savage Arena, inspired by Bryan's photograph. A centered hero leads into the arena, where five locations reveal Projects, Experience, Research, About, and Contact. Built with Astro, TypeScript, selective React components, Three.js, and GSAP. Case-study content ships as static HTML.

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
- `src/components/SavageArena.tsx` - centered hero, history, focus management, and illustrated fallback.
- `src/components/ArenaChapter.tsx` - readable section panels and the shared project selector.
- `src/data/arena-chapters.ts` - destinations, 3D anchors, fallback routes, and hash parsing.
- `src/lib/arena/journey.ts` - one GSAP timeline for camera travel, orientation, and roof reveal, advanced by the renderer.
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

Browser tests use installed Google Chrome locally and Playwright Chromium in CI. They cover desktop and mobile routes, rendered arena journeys, all five locations, geometry picking, interrupted travel, hash history, focus restoration, dragging, remembered motion choices, WebGL failure and context loss, replay controls and offscreen pausing, temporary moment markers, ranking changes, shot controls, project filters, document links, keyboard navigation, automated accessibility, narrow layouts, and no-JavaScript fallbacks. Set `TEST_BASE_URL` to `https://bryanhkwan.github.io/portfolio/` to test the published site instead of starting a local preview.

The exterior rotates clockwise above a drifting cyan cloud bank when motion is enabled. A held drag pauses rotation; three idle seconds after release, the exterior returns to its authored view. Inside, the view stays at the selected destination without an idle reset. A brief scan accent accompanies deliberate camera travel; there is no recurring glitch during reading. CourtVision has a clearly labeled illustrative player-movement layer.

The entrance is a roughly 2.7-second camera sequence through an architectural roof reveal. The independently suspended scoreboard stays visible. Section travel uses an elevated corridor to clear the bowl and scoreboard. Close-up court and seating surfaces gain opacity to establish depth. Location labels and matching ordinary navigation provide mouse, touch, and keyboard access; phones use stable labels with leaders to the projected scene anchors. Desktop panels have independent scrolling, while mobile content flows beneath the scene.

`#arena-overview`, `#arena-projects`, `#arena-experience`, `#arena-research`, `#arena-about`, and `#arena-contact` restore a stable scene without replaying the entrance. Browser Back/Forward restore the selected location. Escape returns to the overview, then the entrance. Case studies include a Return to Home Court link. Existing case-study routes and the full conventional portfolio below the arena remain accessible.

Reduced-motion visitors begin with a still view and immediate navigation. Enable motion is an explicit, remembered override when browser storage is available; a new device request for reduced motion pauses it again. Pause motion also finishes pending travel immediately. Hidden tabs and offscreen scenes stop rendering and pause the journey clock. Continuous ambient effects use paced frames; short camera flights use animation frames. Mouse-wheel scrolling remains page scrolling, and touch dragging is opt-in.

The arena is an artistic reconstruction, not a measured digital twin. The five locations are portfolio wayfinding metaphors. The reference photograph is not distributed with the site. Mobile browser tests use Chromium emulation; they do not establish performance on a physical iPhone or Android handset.

## Publishing

`.github/workflows/deploy.yml` installs locked dependencies, runs unit tests, checks types, builds the site, and runs browser tests before deploying `dist/` to GitHub Pages on pushes to `main`. Pull requests run the checks without publishing. GitHub Pages must use **GitHub Actions** as its build source.

The `site` and `base` settings in `astro.config.mjs` target this repository's existing public URL. Change both when moving domains or repositories.

## Content and media

The court walkthrough and scouting exercise use fictional players and authored illustrative data. The walkthrough is a small portfolio interaction, not the private CourtVision runtime or a recording of team evidence. Playback begins only on request and pauses when hidden or offscreen. Moment markers last for the current component session.

CourtVision's case study reflects the current hosted coaching platform: film, source-synchronized replay, player context, coach-board tools, exports, and private delivery. Its model and reconstruction limitations remain explicit. Historical basketball results are limited to the documented three-game sample. The Astros exercise shows observational associations, not an achieved revenue increase or a client engagement.

Only aggregate Astros/research figures are included; respondent-level case data is not published. Earlier CourtVision assets retain their public URLs for compatibility but are no longer used in the showcase. Current team footage, identities, private packages, credentials, and source remain private. The portal link leads to the approved-coach sign-in page. Existing resume, recommendation, and validation PDF URLs still work. Fonts are served locally.

The previous HTML/CSS/JS files and original asset copies were preserved locally in the ignored `.local-backup/pre-courtside/` directory during migration. Private project inventory and concept exploration files are also excluded from publication.
