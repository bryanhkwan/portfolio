import type { APIRoute } from 'astro';
export function getStaticPaths() {
  return [
    { params: { legacy: 'projects.html' }, props: { target: 'work/' } },
    { params: { legacy: 'computer-vision.html' }, props: { target: 'work/courtvision/' } },
    { params: { legacy: 'proof.html' }, props: { target: 'work/basketball/#validation' } },
  ];
}
export const GET: APIRoute = ({ props }) => {
  const target = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${props.target}`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue to Bryan Kwan’s portfolio</title><link rel="canonical" href="https://bryanhkwan.github.io${target}"><meta http-equiv="refresh" content="0;url=${target}"></head><body><p>This page has moved. <a href="${target}">Continue to the case study or project collection.</a></p><script>const next=${JSON.stringify(target)};location.replace(next+(next.includes('#')?'':location.hash));</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
