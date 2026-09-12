import { href } from '../lib/paths';
import '../styles/portfolio-mode.css';

/** Native links work before hydration, without WebGL, and with JavaScript disabled. */
export default function PortfolioViewSwitch({ current }: { current: 'arena' | 'quick' }) {
  return <nav className="portfolio-view-switch" aria-label="Portfolio view">
    <a href={href('#arena-home')} data-portfolio-view="arena" aria-current={current === 'arena' ? 'page' : undefined}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Zm0 8 7-4M10 10 3 6m7 4v8"/></svg>
      Interactive
    </a>
    <a href={href('overview/')} data-portfolio-view="quick" aria-current={current === 'quick' ? 'page' : undefined} title="Read projects, experience, and background in one simple page">
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="M3 4h14M3 10h14M3 16h9"/></svg>
      Quick view
    </a>
  </nav>;
}
