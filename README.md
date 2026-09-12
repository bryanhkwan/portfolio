# Bryan Kwan — Sports analytics & data products

An interactive portfolio with CourtVision's Midnight Blue and Rocket Gold visual language. Home Court is an immersive portfolio journey through an original Three.js x-ray study of Savage Arena, inspired by Bryan's photograph. The homepage occupies one viewport: a centered hero leads into five modeled destinations whose large physical screens become the reading interface. There are no conventional portfolio sections or footer below the arena. Built with Astro, TypeScript, selective React components, Three.js, and GSAP. Case-study content ships as static HTML.

**Live:** https://bryanhkwan.github.io/portfolio/

**Quick view:** https://bryanhkwan.github.io/portfolio/overview/

The visible **Interactive / Quick view** switch offers two complete ways to browse. Quick view is a conventional, printable page with positioning, a résumé link, four selected projects, experience, education, skills, research, and contact. Its content is static HTML with ordinary document scrolling; it does not load the arena, React hydration, GSAP, or an animated replay.

An explicit mode selection is saved locally when browser storage is available. A later visit to the bare homepage opens the saved Quick view, while explicit arena hashes and browser Back/Forward retain their destinations. Case-study return links lead back to Quick view when it is selected. Both mode links and all Quick view content remain usable without JavaScript or storage; motion preference and portfolio mode are independent choices.

## Local development

Use Node 24 and npm. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro, followed by `/portfolio/`. The homepage source is now `src/pages/index.astro`; the former root `index.html` has been replaced by the Astro build.

## Structure

- `src/pages/` — homepage, project index, four case studies, research, about, and 404.
- `src/pages/overview.astro` and `src/styles/quick-view.css` — recruiter-oriented reading view, responsive editorial layout, and print styles.
- `src/layouts/QuickViewLayout.astro` — lightweight static reading shell with local fonts and no client framework hydration.
- `src/components/PortfolioViewSwitch.tsx` and `PortfolioPreference.astro` — native mode links, remembered landing choice, and case-study return behavior.
- `src/components/ScoutingLab.tsx` — roster priorities and an interactive shot profile.
- `src/layouts/ArenaLayout.astro` - dedicated homepage shell with a bounded dynamic viewport and no shared footer.
- `src/components/SavageArena.tsx` - centered hero, persistent destination navigation, screen handoff, history, focus management, and illustrated fallback.
- `src/components/ArenaChapter.tsx` - large semantic HTML reading surfaces: employer, project, research, and biography selectors; one internal reading region; and direct contact actions.
- `src/data/arena-chapters.ts` - destinations, 3D anchors, fallback routes, and hash parsing.
- `src/lib/arena/journey.ts` - one renderer-driven GSAP timeline for room entrances and exits, camera travel, roof reveal, and responsive docking at each physical display.
- `src/lib/arena/destinations.ts` - the shared screen-coordinate registry and procedural jumbotron, film room, court display, story wall, and atrium geometry. Architecture uses batched solids and linework; selected rooms expose their close-up furnishings.
- `src/lib/arena/engine.ts` - rendering, picking, motion preferences, and projection of the selected physical screen into the HTML reading surface's visible bounds.
- `src/lib/arena/` — procedural arena geometry, a dynamically loaded Three.js renderer, a single-draw cloud bank, and a shader-based scanline glitch. Approximately 4,500 instanced seats, exposed trusses, a suspended scoreboard, hoops, and an illustrative movement layer; no external model or texture requests.
- `src/assets/toledo-rocket.svg` — the official gold rocket paths, drawn synchronously onto the center-court texture; source attribution is included in the SVG.
- `src/styles/arena.css` — homepage architectural art direction, responsive scene framing, and interaction controls.
- `src/components/CourtReplay.tsx` — a public illustrative court walkthrough, with playback, scrubbing, movement history, shot locations, and temporary teaching-moment markers.
- `src/data/` — project metadata and clearly labeled fictional scouting examples.
- `src/styles/constellation.css` — the active navy/gold design system and responsive product interfaces; shared layout primitives remain in the other stylesheets.
- `src/layouts/SiteLayout.astro` — shared navigation, metadata, contact, and footer for the ordinary project, research, and about routes.
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

Browser tests use installed Google Chrome locally and Playwright Chromium in CI. They cover desktop and mobile routes, rendered arena journeys, all five locations, court and jumbotron picking, physical-screen/HTML alignment, zero homepage document overflow, internal reading scroll, destination selectors, interrupted travel, hash history, focus restoration, dragging, remembered motion choices, hidden-document suspension, WebGL failure and context loss, replay controls and offscreen pausing, temporary moment markers, ranking changes, shot controls, project filters, document links, keyboard navigation, automated accessibility, narrow and short layouts, and no-JavaScript fallbacks. Set `TEST_BASE_URL` to `https://bryanhkwan.github.io/portfolio/` to test the published site instead of starting a local preview.

The exterior rotates clockwise above a drifting cyan cloud bank when motion is enabled. A held drag pauses rotation; three idle seconds after release, the exterior returns to its authored view. Inside, the view stays at the selected destination without an idle reset. A brief scan accent accompanies deliberate camera travel; there is no recurring glitch during reading. CourtVision has a clearly labeled illustrative player-movement layer.

The entrance is a short, skippable camera sequence through an architectural roof reveal. The independently suspended jumbotron stays visible. Destination travel uses authored paths and room entrances; the final view faces a physical display squarely. The renderer projects that display's bounds into the page, where crisp, selectable HTML replaces its decorative screen content. The scene stays fixed while the visitor reads or changes a selector.

The five destinations are:

- **Projects / Center court:** a deployable tactical display, with CourtVision leading the project selector and links to the full case studies.
- **Experience / Jumbotron:** four physical screen faces, rounded housing, suspension rigging, and a broadcast-style reading screen with Toledo Athletics and Modern Builders Supply role selectors.
- **Research / Film room:** a doorway and passage into a room with review seats, acoustic panels, an offset laptop console, and a large research screen. Question, Approach, Findings, and Limitations remain separate, directly selectable chapters.
- **About / Concourse story wall:** an architectural gallery with display cases and benches, plus Toledo roots, education, and working-approach chapters.
- **Contact / Atrium welcome desk:** glass mullions, a canopy, lobby furniture, and a broad contact screen with email, LinkedIn, GitHub, and resume actions.

The homepage document does not scroll on desktop or mobile. Longer content scrolls inside one bounded reading region, while destination navigation and return controls stay reachable. Narrow and short viewports crop more of the scenic surround and reflow the content instead of shrinking a landscape screen into a miniature. Location labels and matching ordinary navigation support mouse, touch, and keyboard access; phones use stable labels with leaders to the projected scene anchors.

`#arena-overview`, `#arena-projects`, `#arena-experience`, `#arena-research`, `#arena-about`, and `#arena-contact` restore a stable scene without replaying the entrance. Browser Back/Forward restore the selected location. Escape returns to the overview, then the entrance. Case studies include a Return to Home Court link. The former below-arena portfolio composition has been removed. Full case studies keep normal document scrolling: the public court replay is on the CourtVision case study, and the scouting exercise is on the basketball case study. Direct section links also provide useful routes without JavaScript.

Reduced-motion visitors begin with a still view and immediate navigation. Enable motion is an explicit, remembered override when browser storage is available; a new device request for reduced motion pauses it again. Pause motion also finishes pending travel immediately. Hidden tabs and offscreen scenes stop rendering and pause the journey clock. Settled reading destinations also stop continuous rendering and atmospheric animation. Ambient effects outside reading use paced frames; short camera flights use animation frames. The mouse wheel scrolls the active reading region, never drives a camera flight; ordinary case-study pages retain normal scrolling. Touch dragging is opt-in.

The arena is an artistic reconstruction, not a measured digital twin. The five locations are portfolio wayfinding metaphors. The film room, concourse gallery, and atrium draw on documented Toledo facility features; their room layouts, furniture, exact positions, and portfolio screens are stylized interpretations rather than a surveyed floor plan. The reference photograph is not distributed with the site. Mobile browser tests use Chromium emulation; they do not establish performance on a physical iPhone or Android handset.

## Publishing

`.github/workflows/deploy.yml` installs locked dependencies, runs unit tests, checks types, builds the site, and runs browser tests before deploying `dist/` to GitHub Pages on pushes to `main`. Pull requests run the checks without publishing. GitHub Pages must use **GitHub Actions** as its build source.

The `site` and `base` settings in `astro.config.mjs` target this repository's existing public URL. Change both when moving domains or repositories.

## Content and media

The court walkthrough and scouting exercise use fictional players and authored illustrative data. The walkthrough is a small portfolio interaction, not the private CourtVision runtime or a recording of team evidence. Playback begins only on request and pauses when hidden or offscreen. Moment markers last for the current component session.

CourtVision's case study reflects the current hosted coaching platform: film, source-synchronized replay, player context, coach-board tools, exports, and private delivery. Its model and reconstruction limitations remain explicit. Historical basketball results are limited to the documented three-game sample. The Astros exercise shows observational associations, not an achieved revenue increase or a client engagement.

Only aggregate Astros/research figures are included; respondent-level case data is not published. Earlier CourtVision assets retain their public URLs for compatibility but are no longer used in the showcase. Current team footage, identities, private packages, credentials, and source remain private. The portal link leads to the approved-coach sign-in page. Existing resume, recommendation, and validation PDF URLs still work. Fonts are served locally.

The previous HTML/CSS/JS files and original asset copies were preserved locally in the ignored `.local-backup/pre-courtside/` directory during migration. Private project inventory and concept exploration files are also excluded from publication.
