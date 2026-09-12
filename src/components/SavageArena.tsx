import { useEffect, useRef, useState } from 'react';
import type { ArenaEngine, ArenaMotion, ArenaView } from '../lib/arena/engine';
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

function Icon({ name }: { name: 'orbit' | 'roof' | 'tracking' | 'reset' }) {
  return <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    {name === 'orbit' && <><ellipse cx="10" cy="10" rx="8" ry="3.5" transform="rotate(-30 10 10)"/><circle cx="10" cy="10" r="2"/></>}
    {name === 'roof' && <><path d="M2 10L10 4L18 10L10 16Z M2 14L10 20L18 14" transform="translate(0 -2)"/></>}
    {name === 'tracking' && <><path d="M3 15L7 7L12 12L17 4"/><circle cx="3" cy="15" r="1.5"/><circle cx="17" cy="4" r="1.5"/></>}
    {name === 'reset' && <><path d="M3 9a7 7 0 1 1 1.5 5M3 3v6h6"/></>}
  </svg>;
}

export default function SavageArena() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ArenaEngine | null>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'fallback'>('loading');
  const [view, setView] = useState<ArenaView>('orbit');
  const [roof, setRoof] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState(false);
  const [effects, setEffects] = useState(false);
  const [motion, setMotion] = useState<ArenaMotion>('paused');
  useEffect(() => {
    let cancelled = false;
    import('../lib/arena/engine').then(({ mountArena }) => {
      if (cancelled || !host.current) return;
      engine.current = mountArena(host.current, {
        ready: () => { if (!cancelled) setStatus('ready'); },
        failed: () => { if (!cancelled) { setStatus('fallback'); setPlaying(false); setEffects(false); setMotion('paused'); } },
        paused: () => { if (!cancelled) setPlaying(false); },
        viewChanged: value => { if (!cancelled) setView(value); },
        motionChanged: value => { if (!cancelled) setMotion(value); },
        effectsChanged: value => { if (!cancelled) setEffects(value); },
      });
    }).catch(() => { if (!cancelled) setStatus('fallback'); });
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => {
    if (status !== 'fallback') return;
    // Browsers without a working graphics context can also fail to capture a
    // cross-document transition. Use ordinary navigation in the static fallback.
    const style = document.createElement('style');
    style.textContent = '@view-transition { navigation: none; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, [status]);
  const ready = status === 'ready';
  function changeView(value: ArenaView) { setView(value); engine.current?.setView(value); }
  function toggleTracking() {
    const next = !tracking; setTracking(next); engine.current?.setTracking(next);
    if (!next) setPlaying(false);
  }
  return <section className="arena-experience" aria-labelledby="hero-title" data-status={status} data-camera={view} data-drag={drag} data-effects={effects} data-motion={motion}>
    <div className="arena-hero wrap">
      <div className="arena-copy">
        <p className="eyebrow arena-kicker"><span className="signal-dot" aria-hidden="true"/> BRYAN KWAN / SPORTS & DATA</p>
        <h1 id="hero-title"><span className="hero-line"><span>The game.</span></span><span className="hero-line"><span>Beneath</span></span><span className="hero-line gold"><span>the surface.</span></span></h1>
        <p className="arena-introduction">I build the tools that bring a different perspective to sports. From the film room to the next roster decision.</p>
        <div className="arena-actions"><a className="button button-dark" href="#selected-work">Explore my work <span aria-hidden="true">↗</span></a><a className="quiet-link" href={href('about/')}>Meet Bryan <span aria-hidden="true">→</span></a></div>
        <div className="arena-signature"><span aria-hidden="true">⌖</span><div>Rooted in Toledo.<br/><span>Built for the next question.</span></div></div>
      </div>
      <div className="arena-visual">
        <div className="arena-location"><span>SAVAGE ARENA</span><span>UNIVERSITY OF TOLEDO</span></div>
        <div className="arena-render-area"><ArenaPoster/><div className="arena-canvas-host" ref={host}/></div>
        <div className="arena-scene-note"><span className="arena-axis" aria-hidden="true"><i/>Y<span>X</span></span><div><span className="arena-edition">01 — HOME COURT</span><p>Another way to see the game.</p></div><span className="arena-render-label">X-RAY / 3D STUDY</span></div>
        <div className="arena-gesture" id="arena-instructions">
          <span>{status === 'fallback' ? 'Static arena illustration · 3D unavailable in this browser' : ready ? 'Drag to orbit · use view controls to explore' : 'An architectural study of Savage Arena'}</span>
          <button className="arena-touch-toggle" disabled={!ready} aria-pressed={drag} onClick={() => { setDrag(!drag); engine.current?.setDrag(!drag); }}>{drag ? 'Disable drag controls' : 'Enable drag controls'}</button>
        </div>
      </div>
    </div>
    <div className="arena-control-shell wrap">
      <div className="arena-ambient-bar">
        <p><span className="arena-ambient-dot" aria-hidden="true"/>{!ready ? 'SAVAGE ARENA / X-RAY STUDY' : motion === 'orbiting' ? 'CLOCKWISE ORBIT' : motion === 'returning' ? 'RETURNING TO HOME COURT' : motion === 'paused' ? 'EFFECTS PAUSED' : 'EXPLORE / RETURNS AFTER 3 SECONDS'}</p>
        <button className="arena-effects-toggle" disabled={!ready} onClick={() => engine.current?.setEffects(!effects)}><span aria-hidden="true">{effects ? 'Ⅱ' : '▷'}</span>{effects ? 'Pause effects' : 'Resume effects'}</button>
      </div>
      <div className="arena-control-bar">
        <div className="arena-view-controls" role="group" aria-label="Arena camera views">
          {(['orbit','courtside','top'] as const).map(value => <button key={value} disabled={!ready} aria-pressed={view === value} onClick={() => changeView(value)}>{value === 'orbit' && <Icon name="orbit"/>}{value === 'orbit' ? 'Orbit' : value === 'courtside' ? 'Courtside' : 'Top down'}</button>)}
        </div>
        <div className="arena-layer-controls" role="group" aria-label="Arena layers">
          <button disabled={!ready} aria-pressed={roof} onClick={() => { setRoof(!roof); engine.current?.setRoof(!roof); }}><Icon name="roof"/>Roof structure<span className="toggle-led" aria-hidden="true"/></button>
          <button disabled={!ready} aria-pressed={tracking} onClick={toggleTracking}><Icon name="tracking"/>CourtVision layer<span className="toggle-led" aria-hidden="true"/></button>
        </div>
        <div className="arena-direction-controls" role="group" aria-label="Rotate arena">
          <button disabled={!ready} aria-label="Rotate left" onClick={() => engine.current?.rotate(-1)}>←</button><button disabled={!ready} aria-label="Rotate right" onClick={() => engine.current?.rotate(1)}>→</button><button disabled={!ready} aria-label="Reset view" onClick={() => changeView('orbit')}><Icon name="reset"/></button>
        </div>
      </div>
      <div className="arena-caption-row">
        <p className="arena-description" aria-live="polite">{tracking ? <><span className="gold">02 / COURTVISION</span> Illustrative movement. Follow the paths behind a possession.</> : <><span>01 / ARCHITECTURE</span> A study of my home court, inspired by a photograph I took.</>}</p>
        {tracking ? <button className="arena-play" disabled={!ready} onClick={() => { setPlaying(!playing); engine.current?.setPlaying(!playing); }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>{playing ? 'Pause movement' : 'Play movement'}</button> : <span className="arena-art-note">Artistic reconstruction · not a measured model</span>}
      </div>
    </div>
    <div className="arena-scroll-cue wrap"><span>ANALYTICS. ENGINEERING. A FEEL FOR THE GAME.</span><a href="#selected-work">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div>
  </section>;
}
