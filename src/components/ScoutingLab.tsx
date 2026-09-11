import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { candidates, fitScore, rankCandidates, weights, type Priority } from '../data/scouting';
gsap.registerPlugin(Flip);

export default function ScoutingLab({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'shots' | 'fit'>('fit');
  const [priority, setPriority] = useState<Priority>('balanced');
  const [selected, setSelected] = useState('b');
  const [view, setView] = useState<'dots' | 'zones'>('dots');
  const [ready, setReady] = useState(false);
  const rows = useRef<HTMLDivElement>(null);
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const animation = useRef<ReturnType<typeof Flip.from> | null>(null);
  const ranked = rankCandidates(priority);
  const player = candidates.find(candidate => candidate.id === selected)!;
  const w = weights[priority];
  useEffect(() => { setReady(true); return () => { animation.current?.kill(); }; }, []);
  useLayoutEffect(() => {
    if (flipState.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation.current = Flip.from(flipState.current, { duration: .55, ease: 'power2.out', absolute: false });
    }
    flipState.current = null;
  }, [priority]);
  function changePriority(value: Priority) {
    animation.current?.kill();
    if (rows.current) flipState.current = Flip.getState(rows.current.children);
    setPriority(value);
  }
  const made = player.shots.filter(shot => shot[2]).length;
  const zones = [{ name: 'Left side', x: 0, y: 0, width: 165, height: 350 }, { name: 'Interior', x: 165, y: 0, width: 170, height: 180 }, { name: 'Top', x: 165, y: 180, width: 170, height: 170 }, { name: 'Right side', x: 335, y: 0, width: 165, height: 350 }].map(zone => ({ ...zone, count: player.shots.filter(([x,y]) => x * 5 >= zone.x && x * 5 < zone.x + zone.width && y * 4 >= zone.y && y * 4 < zone.y + zone.height).length }));
  return <div className={`scouting-lab ${compact ? 'lab-compact' : ''}`}>
    <div className="lab-heading"><span className="eyebrow">THE DECISION LAB</span><span className="lab-indicator">BASKETBALL / 01</span></div>
    <div className="lab-tabs" role="group" aria-label="Analysis view">
      <button type="button" disabled={!ready} aria-pressed={mode === 'fit'} onClick={() => setMode('fit')}>Roster fit</button>
      <button type="button" disabled={!ready} aria-pressed={mode === 'shots'} onClick={() => setMode('shots')}>Shot profile</button>
    </div>
    {mode === 'fit' ? <div className="fit-view">
      <div className="priority-heading"><label htmlFor={compact ? 'case-priority' : 'hero-priority'}>What does the team need?</label><select id={compact ? 'case-priority' : 'hero-priority'} value={priority} onChange={event => changePriority(event.target.value as Priority)} disabled={!ready}>
        <option value="balanced">Balanced impact</option><option value="shooting">More shooting</option><option value="defense">More defense</option>
      </select></div>
      <div className="rank-table-heading"><span>PLAYER / ROLE</span><span>FIT SCORE</span></div>
      <div ref={rows} className="rank-list" aria-label="Players ranked by weighted fit score">
        {ranked.map((candidate, index) => <div className="rank-row" key={candidate.id} data-flip-id={candidate.id} data-player={candidate.id}>
          <span className="rank-number">0{index + 1}</span><div className="rank-player"><strong>{candidate.label}</strong><span>{candidate.role}</span></div>
          <div className="rank-score"><strong>{fitScore(candidate, priority).toFixed(1)}</strong><div className="score-track"><span style={{ width: `${fitScore(candidate, priority)}%` }} /></div></div>
        </div>)}
      </div>
      <p className="lab-insight" aria-live="polite"><span aria-hidden="true">↳</span><span><strong>{ranked[0].label}</strong> leads when {priority === 'shooting' ? 'shooting carries the most weight.' : priority === 'defense' ? 'defense carries the most weight.' : 'the team needs a balanced contribution.'}</span></p>
      <details className="score-explanation"><summary>How the score works</summary><p>Fit = shooting × {w.shooting.toFixed(2)} + defense × {w.defense.toFixed(2)} + playmaking × {w.playmaking.toFixed(2)}. Each input is a fictional rating from 0–100.</p><div className="data-table"><table><caption>Fictional input ratings</caption><thead><tr><th>Player</th><th>Shooting</th><th>Defense</th><th>Playmaking</th></tr></thead><tbody>{candidates.map(c => <tr key={c.id}><td>{c.label}</td><td>{c.shooting}</td><td>{c.defense}</td><td>{c.playmaking}</td></tr>)}</tbody></table></div></details>
    </div> : <div className="shot-view">
      <div className="shot-controls"><label>Player<select aria-label="Player" value={selected} onChange={event => setSelected(event.target.value)}>{candidates.map(c => <option value={c.id} key={c.id}>{c.label} · {c.role}</option>)}</select></label><div className="shot-toggle" role="group" aria-label="Shot chart style"><button aria-pressed={view === 'dots'} onClick={() => setView('dots')} type="button">Shots</button><button aria-pressed={view === 'zones'} onClick={() => setView('zones')} type="button">Zones</button></div></div>
      <svg viewBox="0 0 500 350" className="shot-court" role="img" aria-label={`${player.label}: ${made} made of ${player.shots.length} illustrative shots. ${view === 'zones' ? zones.map(z => `${z.name}: ${z.count} attempts`).join('; ') : 'Filled dots show makes; crosses show misses.'}`}>
        <rect width="500" height="350" fill="var(--panel)" />
        {view === 'zones' && zones.map(({ x, y, width, height, count }, i) => {
          return <g key={i}><rect x={x} y={y} width={width} height={height} fill="var(--red)" opacity={.06 + count / 24} /><text x={x + width / 2} y={y + height - 28} textAnchor="middle" className="zone-count">{count} attempts</text></g>;
        })}
        <g fill="none" stroke="#628db8" strokeWidth="1.2"><path d="M25 15H475V325H25ZM170 15V166H330V15M170 166A80 80 0 0 0 330 166M60 15V70C60 294 440 294 440 70V15"/><path d="M232 38H268M250 41v9"/><circle cx="250" cy="57" r="8"/><path d="M222 57a28 28 0 0 0 56 0"/></g>
        {view === 'dots' && player.shots.map(([x,y,isMade], i) => isMade ? <circle key={i} cx={x * 5} cy={y * 4} r="6" fill="var(--red)" stroke="var(--paper)" strokeWidth="2" /> : <path key={i} d={`M${x * 5 - 4} ${y * 4 - 4}l8 8m0 -8l-8 8`} stroke="var(--ink)" strokeWidth="2" />)}
      </svg>
      <div className="shot-caption"><span>{view === 'dots' ? '● Make / × Miss' : 'Darker = more attempts'}</span><span>{made}/{player.shots.length} sample makes</span></div>
      <p className="lab-insight"><span aria-hidden="true">↳</span><span>{player.role}: compare a player’s spatial profile with the role you need.</span></p>
    </div>}
    <p className="lab-disclaimer">Illustrative exercise · fictional players and data</p>
    {!ready && <p className="lab-static-note">The balanced shortlist is shown. Interactive views become available when JavaScript loads.</p>}
  </div>;
}
