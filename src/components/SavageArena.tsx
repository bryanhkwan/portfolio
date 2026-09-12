import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ArenaEngine, ArenaMotionSource } from '../lib/arena/engine';
import { arenaChapters, destinationFromHash, destinationHash, type ArenaDestination, type JourneyState } from '../data/arena-chapters';
import ArenaChapter from './ArenaChapter';
import { href } from '../lib/paths';
function ArenaPoster() {
  const project = (x: number, y: number, z: number) => `${450 + x * 7.1 - z * 6.2},${350 + x * 2.9 + z * 3.6 - y * 12}`;
  const rect = (x: number, z: number, y: number) => [[-x,-z], [x,-z], [x,z], [-x,z], [-x,-z]].map(([a,b]) => project(a,y,b)).join(' ');
  return <svg className="arena-poster" viewBox="0 0 900 650" role="img" aria-label="Architectural illustration of Savage Arena: a gold basketball court surrounded by cyan seating tiers and roof trusses">
    <g fill="none" stroke="#78cce9" strokeWidth=".85">
      <ellipse cx="450" cy="422" rx="388" ry="170" opacity=".13"/>
      {Array.from({length: 16}, (_,i) => <polyline key={i} points={rect(17 + i * .65, 10 + i * .6, i * .42)} opacity={.25 + i * .025}/>)}
      {[-26,-20,-13,-6,0,6,13,20,26].map(x => <g key={x} opacity=".32"><polyline points={`${project(x,6,-19)} ${project(x,17,-19)} ${project(x,19,0)} ${project(x,17,19)} ${project(x,6,19)}`}/><polyline points={`${project(x,15,-19)} ${project(x,17,0)} ${project(x,15,19)}`}/><path d={`M${project(x,17,-19)} L${project(x,17,0)} L${project(x,17,19)}`}/></g>)}
      <polyline points={rect(26,19,17)} opacity=".4"/>
      <polyline points={rect(26,19,6)} opacity=".5"/>
    </g>
    <g fill="none" stroke="#ffd200" strokeWidth="1.5"><polyline points={rect(14.3,7.6,0)}/><polyline points={`${project(0,0,-7.6)} ${project(0,0,7.6)}`}/><polyline points={Array.from({length:49},(_,i)=>project(Math.cos(i/48*Math.PI*2)*1.8,0,Math.sin(i/48*Math.PI*2)*1.8)).join(' ')}/></g>
    <polygon points={`${project(-3,8,-2)} ${project(3,8,-2)} ${project(3,11,-2)} ${project(-3,11,-2)}`} fill="#0a2132" stroke="#78cce9" strokeWidth="1"/>
  </svg>;
}

export default function SavageArena() {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ArenaEngine | null>(null);
  const desired = useRef<ArenaDestination>('exterior');
  const lastHash = useRef('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const focusAfterTravel = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<JourneyState>({ destination: 'exterior', phase: 'exterior' });
  const stateRef = useRef(state);
  const [effects, setEffects] = useState(false);
  const [motionSource, setMotionSource] = useState<ArenaMotionSource>('visitor');
  const [drag, setDrag] = useState(false);
  function updateState(value: JourneyState) { stateRef.current = value; setState(value); }
  function navigate(destination: ArenaDestination, immediate = false, record = true) {
    desired.current = destination;
    focusAfterTravel.current = true;
    if (record) {
      const hash = destinationHash(destination);
      if (location.hash !== hash) history.pushState(null, '', hash);
      lastHash.current = hash;
    }
    if (engine.current && status !== 'fallback') engine.current.navigate(destination, immediate);
    else updateState({ destination, phase: destination === 'exterior' ? 'exterior' : destination === 'overview' ? 'overview' : 'section' });
  }
  // Event listeners and renderer callbacks use the current navigation function, not a mount-time closure.
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  function follow(event: MouseEvent<HTMLAnchorElement>, destination: ArenaDestination, immediate = false) {
    if (!hydrated || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); returnFocus.current = event.currentTarget;
    navigate(destination, immediate);
  }
  useEffect(() => {
    let cancelled = false;
    setHydrated(true);
    desired.current = destinationFromHash(location.hash) ?? 'exterior';
    lastHash.current = location.hash;
    if (desired.current !== 'exterior') updateState({ destination: desired.current, phase: desired.current === 'overview' ? 'overview' : 'section' });
    import('../lib/arena/engine').then(({ mountArena }) => {
      if (cancelled || !host.current) return;
      engine.current = mountArena(host.current, {
        ready: () => { if (!cancelled) setStatus('ready'); },
        failed: () => { if (!cancelled) { setStatus('fallback'); setEffects(false); const destination = desired.current; updateState({ destination, phase: destination === 'exterior' ? 'exterior' : destination === 'overview' ? 'overview' : 'section' }); } },
        changed: value => { if (!cancelled) updateState(value); },
        selected: chapter => { returnFocus.current = root.current?.querySelector(`[data-anchor="${chapter}"]`) ?? null; navigateRef.current(chapter); },
        effectsChanged: (value, source) => { if (!cancelled) { setEffects(value); setMotionSource(source); } },
      });
      engine.current.navigate(desired.current, true);
    }).catch(() => { if (!cancelled) setStatus('fallback'); });
    function restore() {
      if (location.hash === lastHash.current) return;
      lastHash.current = location.hash;
      navigateRef.current(destinationFromHash(location.hash) ?? 'exterior', true, false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !root.current?.contains(document.activeElement)) return;
      const phase = stateRef.current.phase;
      if (phase === 'exterior') return;
      event.preventDefault(); navigateRef.current(phase === 'overview' ? 'exterior' : 'overview', true);
    }
    window.addEventListener('popstate', restore); window.addEventListener('hashchange', restore);
    document.addEventListener('keydown', escape);
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    if (!focusAfterTravel.current || !['section', 'overview', 'exterior'].includes(state.phase)) return;
    focusAfterTravel.current = false;
    const focusFrame = requestAnimationFrame(() => {
    if (state.phase === 'section') {
      const heading = root.current?.querySelector<HTMLElement>('#arena-chapter-title');
      heading?.focus({ preventScroll: true });
      if (matchMedia('(max-width: 760px)').matches) heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else {
      const target = state.phase === 'exterior' ? root.current?.querySelector<HTMLElement>('.arena-enter') : returnFocus.current?.matches('[data-anchor], [data-destination]') ? returnFocus.current : root.current?.querySelector<HTMLElement>('[data-anchor="projects"]');
      target?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [state]);
  useEffect(() => {
    if (status !== 'fallback') return;
    const style = document.createElement('style'); style.textContent = '@view-transition { navigation: none; }'; document.head.appendChild(style);
    return () => style.remove();
  }, [status]);
  const exterior = state.phase === 'exterior';
  const overview = state.phase === 'overview';
  const travelling = ['entering', 'travelling', 'returning'].includes(state.phase);
  const chapter = arenaChapters.find(item => item.id === state.destination);
  const close = () => navigate('overview');
  return <section ref={root} className="arena-experience" aria-label="Home Court — Bryan Kwan’s interactive portfolio" data-status={status} data-phase={state.phase} data-destination={state.destination} data-panel={Boolean(chapter)} data-effects={effects} data-drag={drag}>
    <div className="arena-stage">
      <div className="arena-stage-heading"><a href={href()} onClick={event => follow(event, 'exterior')} aria-label="Return to Home Court entrance"><span className="arena-home-symbol" aria-hidden="true">⌖</span> HOME COURT<span className="arena-heading-divider"> / </span><span className="arena-heading-location">SAVAGE ARENA</span></a><span className="arena-edition">BRYAN KWAN / PORTFOLIO</span></div>
      <div className="arena-scene">
        <ArenaPoster/><div className="arena-canvas-host" ref={host}/>
        <div className="arena-hotspots" hidden={!overview} aria-label="Explore arena locations">
          <svg className="arena-leaders" aria-hidden="true">{arenaChapters.map(item => <line key={item.id} data-leader={item.id}/>)}</svg>
          {arenaChapters.map(item => <a key={item.id} data-anchor={item.id} href={href(item.fallback)} onClick={event => follow(event, item.id)} onMouseEnter={() => engine.current?.highlight(item.id)} onMouseLeave={() => engine.current?.highlight(null)} onFocus={() => engine.current?.highlight(item.id)} onBlur={() => engine.current?.highlight(null)}><span>{item.number}</span><div><strong>{item.title}</strong><small>{item.location}</small></div><i aria-hidden="true">↗</i></a>)}
        </div>
      </div>
      <div className="arena-intro" aria-hidden={!exterior} inert={!exterior}>
        <p className="arena-invitation">WELCOME TO MY HOME COURT</p>
        <h1 id="hero-title"><span className="hero-line"><span>BRYAN KWAN</span></span></h1>
        <p className="arena-disciplines">Sports analytics. Data. Product.</p>
        <p className="arena-intro-note">A feel for the game. A different perspective.</p>
        <div className="arena-entrance-actions"><a className="arena-enter" href={href('work/')} onClick={event => follow(event, 'overview')}><span>Enter the arena</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></a><a className="arena-project-shortcut" href={href('work/')} onClick={event => follow(event, 'projects', true)}>Or go straight to the projects <span aria-hidden="true">↗</span></a></div>
      </div>
      {overview && <div className="arena-overview-heading"><p>FIVE PLACES. ONE PERSPECTIVE.</p><h2>Find your way around.</h2><span>Choose a location or use the menu below.</span></div>}
      {travelling && <div className="arena-travel-status"><span><i aria-hidden="true"/>{state.phase === 'entering' ? 'ENTERING HOME COURT' : state.phase === 'returning' ? 'RETURNING HOME' : `EXPLORING ${chapter?.title.toUpperCase() ?? 'THE ARENA'}`}</span><button onClick={() => engine.current?.skip()}>{state.phase === 'entering' ? 'Skip entrance' : 'Skip transition'} <span aria-hidden="true">→</span></button></div>}
      {chapter && state.phase === 'section' && <ArenaChapter key={chapter.id} chapter={chapter.id} close={close}/>}
      <div className="arena-scene-caption" aria-hidden="true"><span className="arena-coordinate-mark">+<i/>+</span><div>SAVAGE ARENA / TOLEDO, OHIO<br/><span>{chapter ? `${chapter.number} — ${chapter.location.toUpperCase()}` : 'AN ARCHITECTURAL STUDY OF HOME'}</span></div><span className="arena-caption-right">{exterior ? '00 / 05' : 'EXPLORE THE ARENA'}</span></div>
    </div>
    <div className="arena-navigation-shell">
      {!exterior && <nav className="arena-chapter-nav" aria-label="Portfolio sections">
        {arenaChapters.map(item => <a key={item.id} data-destination={item.id} href={href(item.fallback)} aria-current={state.destination === item.id ? 'location' : undefined} onClick={event => follow(event, item.id)}><span className="arena-nav-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.location}</small></span><span className="arena-nav-arrow" aria-hidden="true">↗</span></a>)}
      </nav>}
      <div className="arena-utility-bar">
        <div className="arena-orientation">{!exterior ? <button className="arena-overview-button" onClick={close}>← Arena overview</button> : <span>YOUR NEXT PERSPECTIVE STARTS HERE</span>}</div>
        <p id="arena-instructions">{status === 'fallback' ? 'Still view · all sections remain available' : travelling ? 'A new perspective on the game.' : chapter ? chapter.id === 'projects' ? 'Illustrative tracking on court' : 'Take your time. The view stays here.' : status === 'loading' ? 'Preparing your home court…' : 'Drag to orbit · arrow keys to turn'}</p>
        <div className="arena-utilities">
          {!chapter && !travelling && status === 'ready' && <div className="arena-orbit-buttons" role="group" aria-label="Rotate arena"><button aria-label="Rotate left" onClick={() => engine.current?.rotate(-1)}>↶</button><button aria-label="Rotate right" onClick={() => engine.current?.rotate(1)}>↷</button><button className="arena-touch-toggle" aria-pressed={drag} onClick={() => { setDrag(!drag); engine.current?.setDrag(!drag); }}>{drag ? 'Stop dragging' : 'Enable drag'}</button></div>}
          {status === 'ready' && <button className="arena-effects-toggle" onClick={() => engine.current?.setEffects(!effects)} aria-pressed={effects}><span className="arena-motion-dot" aria-hidden="true"/>{effects ? 'Pause motion' : 'Enable motion'}</button>}
          <a href={href('BryanKwan_Updated_Resume.pdf')} target="_blank" rel="noopener">Résumé <span aria-hidden="true">↗</span><span className="sr-only"> (PDF, opens in a new tab)</span></a>
        </div>
      </div>
      {status === 'ready' && !effects && motionSource === 'device' && <p className="arena-motion-explanation">Your device prefers reduced motion. Explore every section, or enable motion to see the camera journey.</p>}
      <noscript><p className="arena-motion-explanation">The illustrated view is available without JavaScript. Use View projects, the main navigation, or scroll to explore the portfolio.</p></noscript>
    </div>
  </section>;
}
