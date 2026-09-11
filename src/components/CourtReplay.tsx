import { useEffect, useId, useRef, useState } from 'react';

type Point = [number, number];
type View = 'replay' | 'movement' | 'shots';
// Fictional movement, authored for this portfolio. No team footage or tracking data.
const players: { id: number; team: 'gold' | 'blue'; path: Point[] }[] = [
  { id: 1, team: 'gold', path: [[48, 13], [58, 17], [72, 24], [82, 25]] },
  { id: 2, team: 'gold', path: [[61, 37], [66, 38], [78, 40], [83, 38]] },
  { id: 3, team: 'gold', path: [[76, 9], [78, 14], [73, 18], [66, 20]] },
  { id: 4, team: 'blue', path: [[55, 16], [64, 20], [76, 25], [85, 26]] },
  { id: 5, team: 'blue', path: [[70, 33], [73, 34], [79, 35], [85, 33]] },
  { id: 6, team: 'blue', path: [[80, 16], [82, 19], [78, 21], [76, 23]] },
];
const shots: [number, number, boolean][] = [[74,9,true],[84,24,true],[65,25,false],[83,40,true],[72,17,false],[88,26,true],[75,34,true],[69,41,false],[76,7,true],[83,29,false],[85,22,true],[63,17,false]];
const project = ([x, y]: Point): Point => [70 + x * 5.85 + y * 4.6, 150 - x * 1.17 + y * 4.8];
function position(path: Point[], time: number): Point {
  const part = Math.min(time / 8 * 3, 2.99999), index = Math.floor(part), t = part - index;
  return [path[index][0] + (path[index+1][0] - path[index][0]) * t, path[index][1] + (path[index+1][1] - path[index][1]) * t];
}
const stamp = (time: number) => `00:${time.toFixed(1).padStart(4, '0')}`;

export default function CourtReplay({ compact = false }: { compact?: boolean }) {
  const [view, setView] = useState<View>('replay');
  const [time, setTime] = useState(2.4);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [moment, setMoment] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  const id = useId().replace(/:/g, '');
  const note = time < 2.7 ? 'The ball handler draws the first defender.' : time < 5.4 ? 'The weak-side player creates space in the corner.' : 'Pause the sequence. Make the next conversation specific.';

  useEffect(() => { setReady(true); }, []);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setPlaying(false); });
    if (root.current) observer.observe(root.current);
    return () => { document.removeEventListener('visibilitychange', pause); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous = performance.now();
    function tick(now: number) {
      const next = Math.min(8, timeRef.current + Math.min((now - previous) / 1000, .08));
      previous = now; timeRef.current = next; setTime(next);
      if (next >= 8) setPlaying(false); else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  function changeView(next: View) { setPlaying(false); setView(next); }
  const [ballX, ballY] = project(position(players[0].path, time));

  return <div ref={root} className={`replay-console ${compact ? 'replay-compact' : ''}`}>
    <header className="console-header"><div className="console-identity"><span className="cv-mark" aria-hidden="true">C<span>V</span></span><div><strong>CourtVision</strong><span>Interactive product walkthrough</span></div></div><span className="sample-badge">SAMPLE</span></header>
    <div className="console-toolbar"><div className="console-tabs" role="group" aria-label="Court walkthrough view">
      {([['replay','Replay'],['movement','Movement'],['shots','Shot map']] as const).map(([key,label]) => <button type="button" disabled={!ready} aria-pressed={view === key} onClick={() => changeView(key)} key={key}>{label}</button>)}
    </div><span className="console-context">{view === 'shots' ? '12 sample attempts' : '6 sample players'}</span></div>
    <div className="court-stage" data-view={view}>
      <div className="stage-heading"><span>{view === 'shots' ? 'SHOT DISTRIBUTION' : view === 'movement' ? 'MOVEMENT HISTORY' : 'SPATIAL REPLAY'}</span><span>ILLUSTRATIVE SEQUENCE / 01</span></div>
      <svg className="replay-court" viewBox="0 0 900 450" role="img" aria-label={view === 'shots' ? 'Illustrative shot map: 7 makes and 5 misses, shown as dots and crosses.' : `Illustrative ${view === 'movement' ? 'movement paths' : 'court replay'} at ${time.toFixed(1)} seconds. Six anonymous players in gold and blue.`}>
        <defs><linearGradient id={`${id}-floor`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#123559"/><stop offset="1" stopColor="#081a31"/></linearGradient><radialGradient id={`${id}-glow`}><stop stopColor="#003e7e" stopOpacity=".42"/><stop offset="1" stopColor="#003e7e" stopOpacity="0"/></radialGradient></defs>
        <ellipse cx="490" cy="259" rx="405" ry="183" fill={`url(#${id}-glow)`}/>
        <path d="M70 150L620 40L850 280L300 390V399L850 289V280M70 150V159L300 399" fill="#051020" stroke="#233f5e" strokeWidth="1"/>
        <g transform="matrix(5.85 -1.17 4.6 4.8 70 150)">
          <rect width="94" height="50" fill={`url(#${id}-floor)`} stroke="#5b7da0" strokeWidth=".28"/>
          {Array.from({length:18},(_,i)=><path key={i} d={`M${i*5.2} 0V50`} stroke="#365576" strokeOpacity=".22" strokeWidth=".12"/>)}
          <g fill="none" stroke="#628db8" strokeWidth=".23"><path d="M47 0V50M0 17H19V33H0M94 17H75V33H94"/><circle cx="47" cy="25" r="6"/><circle cx="19" cy="25" r="6"/><circle cx="75" cy="25" r="6"/><path d="M0 3H14A23.75 23.75 0 0 1 14 47H0M94 3H80A23.75 23.75 0 0 0 80 47H94"/></g>
          <g fill="none" stroke="#ffd200" strokeWidth=".27" opacity=".8"><circle cx="5.25" cy="25" r=".8"/><circle cx="88.75" cy="25" r=".8"/><path d="M4 22V28M90 22V28"/></g>
          <text x="30" y="27" fill="#507094" fontSize="2.8" fontWeight="600" letterSpacing=".55">COURTVISION</text>
        </g>
        {view === 'shots' ? shots.map(([x,y,made],i)=>{const [px,py]=project([x,y]);return made?<g key={i}><ellipse cx={px} cy={py} rx="17" ry="9" fill="#ffd200" opacity=".08"/><circle cx={px} cy={py} r="5" fill="#ffd200" stroke="#fff0a1" strokeWidth="1.5"/></g>:<path key={i} d={`M${px-4} ${py-4}l8 8m0 -8l-8 8`} stroke="#b6cae2" strokeWidth="2.5"/>;}) : <>
          {view === 'movement' && players.map(player=><polyline key={player.id} points={Array.from({length:21},(_,i)=>project(position(player.path,Math.max(0,time - 3 + i*3/20))).join(',')).join(' ')} stroke={player.team === 'gold' ? '#ffd200' : '#85bfff'} strokeWidth="2" strokeDasharray="3 5" fill="none" opacity=".7"/>)}
          {players.map(player=>{const [x,y]=project(position(player.path,time));const color=player.team==='gold'?'#ffd200':'#85bfff';return <g key={player.id} className="court-player" transform={`translate(${x} ${y})`}>
            <ellipse rx="15" ry="6" fill={color} opacity=".08"/><ellipse rx="10" ry="4" fill="none" stroke={color} strokeOpacity=".65"/>
            <path d="M-4 -2L-2 -13L2 -13L5 -2M0 -13V-24M-9 -15L0 -22L8 -16" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cy="-31" r="4.4" fill={color}/><text y="-43" textAnchor="middle" fill={color} fontSize="11" fontFamily="monospace">0{player.id}</text>
          </g>;})}<circle cx={ballX+13} cy={ballY-10} r="4" fill="#ffffff" stroke="#ffd200" strokeWidth="2"/>
        </>}
      </svg>
      <div className="court-legend">{view === 'shots' ? <><span><i className="legend-make"/> Make · 7</span><span>× Miss · 5</span></> : <><span><i className="legend-gold"/> Gold team</span><span><i className="legend-blue"/> Blue team</span><span className="legend-ball">○ Ball</span></>}</div>
    </div>
    {view !== 'shots' && <div className="replay-transport"><button className="play-control" type="button" disabled={!ready} aria-label={playing ? 'Pause sample replay' : 'Play sample replay'} onClick={()=>{if(time>=8){timeRef.current=0;setTime(0);}setPlaying(p=>!p);}}>{playing ? <span aria-hidden="true">Ⅱ</span> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1L12 7L3 13Z" fill="currentColor"/></svg>}</button><span className="replay-time">{stamp(time)}</span><input type="range" aria-label="Replay time" aria-valuetext={`${time.toFixed(1)} seconds of 8 seconds`} min="0" max="8" step=".1" value={time} disabled={!ready} onChange={event=>{setPlaying(false);timeRef.current=Number(event.target.value);setTime(Number(event.target.value));}}/><span className="replay-duration">00:08.0</span></div>}
    <div className="console-note"><div><span className="note-kicker">{view === 'shots' ? 'SHOT CONTEXT' : 'THE COACHING QUESTION'}</span><p>{view === 'shots' ? 'Where are the opportunities coming from? Connect the location to the film.' : note}</p></div>{view !== 'shots' && <button type="button" disabled={!ready} className="moment-button" onClick={()=>{setPlaying(false);setMoment(time);}}>＋ Mark moment</button>}</div>
    {moment !== null && <div className="saved-moment" role="status">Moment marked at {stamp(moment)} in this walkthrough. <button type="button" onClick={()=>setMoment(null)}>Clear</button></div>}
    <footer className="console-footnote">Illustrative walkthrough · fictional players and movement · not a recording of the private app</footer>
  </div>;
}
