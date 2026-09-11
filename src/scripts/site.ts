import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

document.documentElement.classList.add('js');
const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const nav = document.querySelector<HTMLElement>('#primary-nav');
function setMenu(open: boolean) {
  nav?.classList.toggle('is-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
  toggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}
toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); } });

gsap.registerPlugin(ScrollTrigger);
const media = gsap.matchMedia();
media.add('(prefers-reduced-motion: no-preference)', () => {
  const heroLines = document.querySelectorAll('.hero-line > span');
  if (heroLines.length) gsap.from(heroLines, { yPercent: 105, duration: .9, stagger: .09, ease: 'power3.out', clearProps: 'transform' });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element => {
    gsap.from(element, { y: 28, duration: .75, ease: 'power2.out', clearProps: 'transform', scrollTrigger: { trigger: element, start: 'top 94%', once: true } });
  });
});
