# CourtVision public replay preview

This directory contains an exact snapshot of CourtVision's public renderer modules,
original Blender court and athlete assets, and one anonymous public-demo replay.
The three.js MIT license is retained in `THREE_LICENSE.txt`.

`provenance.json` records source paths, retrieval time, byte counts and SHA-256
hashes. Renderer code and replay coordinates are not modified. The portfolio
controller is in `src/lib/courtvision/viewer.ts`; it runs the singleton engine in
an isolated same-origin iframe at `/previews/courtvision/`.

The sole data source is the public `/api/demo/shot-replay` endpoint for March 12,
2026, `shot_004`. It is a partial estimated reconstruction with source evidence
limits retained. No private practice files, account data, raw videos or training
artifacts are copied. Video metadata in the unchanged JSON is not fetched by this
preview. The complete public demo remains hosted by CourtVision itself.
