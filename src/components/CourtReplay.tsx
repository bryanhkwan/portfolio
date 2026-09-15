import { useEffect, useRef, useState } from 'react';
import { href, courtVisionDemoUrl, courtVisionReplayUrl } from '../lib/paths';
import '../styles/courtvision-preview.css';

type PreviewState = 'idle' | 'loading' | 'ready' | 'error';
const Arrow = () => <span aria-hidden="true">↗</span>;

/** The real CourtVision renderer runs in an isolated document, only on request. */
export default function CourtReplay({ compact = false }: { compact?: boolean }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<PreviewState>('idle');
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  const focusOnReady = useRef(false);
  const restoreFocus = useRef(false);
  const active = state === 'loading' || state === 'ready';

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    if ((state === 'idle' || state === 'error') && restoreFocus.current) {
      restoreFocus.current = false;
      launch.current?.focus();
    }
  }, [state]);
  useEffect(() => {
    if (!active) return;
    const pause = () => frame.current?.contentWindow?.postMessage({ type: 'courtvision-preview-pause' }, location.origin);
    const visibility = () => { if (document.hidden) pause(); };
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', visibility);
    return () => { pause(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'courtvision-preview-ready') {
        setState('ready');
        if (focusOnReady.current && (document.activeElement === launch.current || document.activeElement === document.body)) frame.current?.focus();
      }
      if (event.data?.type === 'courtvision-preview-error') fail();
    };
    window.addEventListener('message', receive);
    const timeout = state === 'loading' ? window.setTimeout(fail, 45000) : undefined;
    return () => { window.removeEventListener('message', receive); window.clearTimeout(timeout); };
  }, [active, state]);
  function fail() {
    restoreFocus.current = document.activeElement === frame.current || document.activeElement === launch.current;
    setState('error');
  }
  function close() {
    restoreFocus.current = true;
    setState('idle');
  }

  return <div ref={root} className={`replay-console cv-preview ${compact ? 'cv-preview-compact' : ''}`} data-preview-state={state}>
    <header className="cv-preview-header">
      <div><span className="cv-preview-eyebrow">Inside the product</span><strong>CourtVision <span>/</span> 3D replay</strong></div>
      <a href={courtVisionDemoUrl} target="_blank" rel="noopener">Try live demo <Arrow /></a>
    </header>
    <div className="cv-preview-stage" data-active={active}>
      <img className="replay-poster" src={href('courtvision/replay-poster.png')} width="1440" height="882" loading="lazy" alt="Actual CourtVision reconstruction of shot 004: articulated players and a basketball on the luminous blue and gold court." />
      {state !== 'ready' && <div className="cv-preview-cover">
        <div className="cv-preview-caption"><span>Toledo × Bowling Green</span><span>March 12, 2026 · Play 004</span></div>
        <div className="cv-preview-launch">
          <p>From the film.<br /><strong>Into the play.</strong></p>
          <button ref={launch} type="button" disabled={!hydrated || state === 'loading'} onClick={() => { focusOnReady.current = document.activeElement === launch.current; setState('loading'); }}>
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m10 2 7 4v8l-7 4-7-4V6l7-4Zm0 8 7-4M10 10 3 6m7 4v8" /></svg>
            {state === 'loading' ? 'Loading 3D replay…' : state === 'error' ? 'Retry 3D replay' : 'Load 3D replay'}
          </button>
          <span>Rotate the court. Scrub the moment.</span>
        </div>
      </div>}
      {active && <iframe ref={frame} src={href('previews/courtvision/')} title="CourtVision 3D replay" className="cv-preview-frame" data-ready={state === 'ready'} sandbox="allow-scripts allow-same-origin" onError={fail} />}
    </div>
    <div className="cv-preview-status" role="status" aria-live="polite">
      {state === 'error' ? 'The 3D preview could not load. You can retry or open the live demo below.' : state === 'loading' ? 'Preparing the court, player models, and published replay.' : state === 'ready' ? 'Selected reconstruction · shot_004. Playback starts paused; you control the view.' : 'Actual CourtVision models and a selected public replay. Reconstruction is still in development.'}
    </div>
    <footer className="cv-preview-footer">
      <p>One published sequence. Explore the full film room, player profiles, and shot maps in the demo.</p>
      <div><a href={courtVisionReplayUrl} target="_blank" rel="noopener">Open film room <Arrow /></a>{active && <button type="button" onClick={close}>Close 3D replay <span aria-hidden="true">×</span></button>}</div>
    </footer>
    <noscript><p className="cv-preview-nojs">Open the live demo to explore CourtVision. This still image shows its actual 3D renderer.</p></noscript>
  </div>;
}
