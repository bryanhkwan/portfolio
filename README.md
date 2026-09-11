# Bryan Kwan — Courtside

An interactive portfolio for sports analytics and data/product work. Built with Astro, TypeScript, a React scouting island, and GSAP. The rest of the site ships as static HTML.

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
- `src/data/` — project metadata and clearly labeled fictional scouting examples.
- `src/styles/` — Courtside typography, responsive layouts, and reduced-motion styles.
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

Browser tests use installed Google Chrome locally and Playwright Chromium in CI. They cover desktop and mobile routes, ranking changes, shot controls, filters, heatmaps, document links, keyboard navigation, automated accessibility, reduced motion, narrow layouts, and no-JavaScript fallbacks. Set `TEST_BASE_URL` to `https://bryanhkwan.github.io/portfolio/` to test the published site instead of starting a local preview.

## Publishing

`.github/workflows/deploy.yml` installs locked dependencies, runs unit tests, checks types, builds the site, and runs browser tests before deploying `dist/` to GitHub Pages on pushes to `main`. Pull requests run the checks without publishing. GitHub Pages must use **GitHub Actions** as its build source.

The `site` and `base` settings in `astro.config.mjs` target this repository's existing public URL. Change both when moving domains or repositories.

## Content and media

The homepage scouting exercise uses fictional players and illustrative data. Historical basketball results are explicitly limited to the documented three-game sample. CourtVision is described as a prototype with incomplete projection coverage. The Astros analyst exercise shows observational associations, not an achieved revenue increase or a client engagement.

Only aggregate Astros/research figures are included; respondent-level case data is not published. CourtVision assets and the existing resume, recommendation, and validation PDF retain their public URLs. The annotated video loads only on demand with `preload="none"`. Fonts are served locally.

The previous HTML/CSS/JS files and original asset copies were preserved locally in the ignored `.local-backup/pre-courtside/` directory during migration. Private project inventory and concept exploration files are also excluded from publication.
