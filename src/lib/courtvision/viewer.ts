type CameraView = 'broadcast' | 'film' | 'top' | 'sideline';
interface Replay {
  available: boolean;
  court: unknown;
  players: unknown[];
  timeline: { start_s: number; release_s: number; end_s: number };
}
interface Engine {
  init(host: HTMLElement): void;
  update(scene: { available: boolean; court: unknown; shots: unknown[] }): void;
  updateReplay(replay: Replay, options: { showPlayers: boolean; showFutureTrajectory: boolean }): void;
  setReplayTime(time: number): unknown;
  setView(view: CameraView, options?: { immediate: boolean }): void;
  rotateCamera(yaw: number): boolean;
  zoomCamera(factor: number): boolean;
  getDiagnostics(): { renderer_ready: boolean; player_asset?: { status: string }; [key: string]: unknown };
}

/** The real CourtVision singleton stays inside this document and dies with its iframe. */
export function initializeCourtVisionPreview() {
  const root = document.querySelector<HTMLElement>('#courtvision-viewer');
  if (!root) return;
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const host = get<HTMLDivElement>('courtvision-stage');
  const playButton = get<HTMLButtonElement>('courtvision-play');
  const playLabel = get<HTMLSpanElement>('courtvision-play-label');
  const slider = get<HTMLInputElement>('courtvision-timeline');
  const output = get<HTMLOutputElement>('courtvision-time');
  const status = get<HTMLElement>('courtvision-frame-status');
  const announcement = get<HTMLElement>('courtvision-announcement');
  const assets = root.dataset.assets!;
  const cameraButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-camera]')];
  const adjustButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-adjust]')];
  let engine: Engine | undefined;
  let replay: Replay;
  let camera: CameraView = 'broadcast';
  let time = 0;
  let playing = false;
  let frame = 0;
  let lastFrame = 0;
  let lastReadout = 0;

  function notify(type: 'courtvision-preview-ready' | 'courtvision-preview-error') {
    if (window.parent !== window) window.parent.postMessage({ type }, location.origin);
  }
  function readout() {
    slider.value = String(time);
    const elapsed = time - replay.timeline.start_s;
    const duration = replay.timeline.end_s - replay.timeline.start_s;
    output.value = `${elapsed.toFixed(2)} / ${duration.toFixed(2)} s`;
    slider.setAttribute('aria-valuetext', `${elapsed.toFixed(2)} seconds of ${duration.toFixed(2)}`);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
    root!.dataset.playing = 'false';
    playButton.setAttribute('aria-label', 'Play replay');
    playLabel.textContent = 'Play';
    playButton.firstElementChild!.textContent = '▶';
    status.textContent = replay && Math.abs(time - replay.timeline.release_s) < .01 ? 'PAUSED AT RELEASE' : 'PAUSED';
    if (replay) readout();
  }
  function tick(now: number) {
    if (!playing || !engine) return;
    time = Math.min(replay.timeline.end_s, time + Math.min((now - lastFrame) / 1000, .1));
    lastFrame = now;
    engine.setReplayTime(time);
    if (now - lastReadout > 70) { readout(); lastReadout = now; }
    if (time >= replay.timeline.end_s) { pause(); announcement.textContent = 'Replay finished.'; return; }
    frame = requestAnimationFrame(tick);
  }
  function selectCamera(view: CameraView) {
    camera = view;
    engine?.setView(view, { immediate: true });
    cameraButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.camera === view)));
    adjustButtons.forEach(button => { button.disabled = view === 'film'; });
  }
  function fail() {
    pause();
    root!.dataset.state = 'error';
    get('courtvision-loading').hidden = true;
    get('courtvision-fallback').hidden = false;
    announcement.textContent = 'The 3D preview is unavailable. The full CourtVision demo link is available.';
    notify('courtvision-preview-error');
  }

  playButton.addEventListener('click', () => {
    if (!engine || root.dataset.state !== 'ready') return;
    if (playing) { pause(); announcement.textContent = 'Replay paused.'; return; }
    if (time >= replay.timeline.end_s - .02) time = replay.timeline.start_s;
    playing = true;
    root.dataset.playing = 'true';
    playButton.setAttribute('aria-label', 'Pause replay');
    playLabel.textContent = 'Pause';
    playButton.firstElementChild!.textContent = 'Ⅱ';
    status.textContent = 'PLAYING';
    announcement.textContent = 'Replay playing.';
    lastFrame = performance.now();
    frame = requestAnimationFrame(tick);
  });
  slider.addEventListener('input', () => {
    if (!engine) return;
    // Capture before pause() refreshes the slider from the previous source time.
    const requestedTime = Number(slider.value);
    pause();
    time = Math.max(replay.timeline.start_s, Math.min(replay.timeline.end_s, requestedTime));
    engine.setReplayTime(time);
    readout();
    status.textContent = Math.abs(time - replay.timeline.release_s) < .01 ? 'PAUSED AT RELEASE' : 'PAUSED';
  });
  cameraButtons.forEach(button => button.addEventListener('click', () => selectCamera(button.dataset.camera as CameraView)));
  adjustButtons.forEach(button => button.addEventListener('click', () => {
    if (!engine || camera === 'film') return;
    switch (button.dataset.adjust) {
      case 'left': engine.rotateCamera(-.18); break;
      case 'right': engine.rotateCamera(.18); break;
      case 'in': engine.zoomCamera(.86); break;
      case 'out': engine.zoomCamera(1.16); break;
    }
  }));
  get('courtvision-reset').addEventListener('click', () => { pause(); selectCamera('broadcast'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'courtvision-preview-pause') pause();
  });
  window.addEventListener('pagehide', pause);

  async function loadEngine(): Promise<Engine> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${assets}court3d.js`;
      const timeout = setTimeout(() => finish(new Error('Renderer timed out.')), 15_000);
      function finish(error?: Error) {
        clearTimeout(timeout);
        window.removeEventListener('courtvision-3d-ready', ready);
        script.onerror = null;
        if (error) reject(error);
        else {
          const loaded = (window as Window & { CourtVision3D?: Engine }).CourtVision3D;
          if (loaded) resolve(loaded); else reject(new Error('Renderer unavailable.'));
        }
      }
      function ready() { finish(); }
      window.addEventListener('courtvision-3d-ready', ready, { once: true });
      script.onerror = () => finish(new Error('Renderer could not load.'));
      document.body.append(script);
    });
  }
  void (async () => {
    const [loaded, response] = await Promise.all([loadEngine(), fetch(`${assets}shot_004.json`, { credentials: 'omit' })]);
    if (!response.ok) throw new Error('Replay unavailable.');
    const data = await response.json() as Replay;
    if (!data.available || !data.players?.length || !data.timeline || ![data.timeline.start_s, data.timeline.release_s, data.timeline.end_s].every(Number.isFinite)) throw new Error('Replay invalid.');
    replay = data;
    engine = loaded;
    engine.init(host);
    engine.update({ available: true, court: replay.court, shots: [] });
    engine.updateReplay(replay, { showPlayers: true, showFutureTrajectory: false });
    time = replay.timeline.release_s;
    engine.setReplayTime(time);
    selectCamera('broadcast');
    slider.min = String(replay.timeline.start_s);
    slider.max = String(replay.timeline.end_s);
    readout();
    if (!engine.getDiagnostics().renderer_ready) throw new Error('WebGL unavailable.');
    const canvas = host.querySelector('canvas');
    canvas?.addEventListener('webglcontextlost', fail, { once: true });
    get('courtvision-loading').hidden = true;
    get('courtvision-controls').inert = false;
    root.dataset.state = 'ready';
    announcement.textContent = 'CourtVision is ready, paused at release. Use Play or the timeline to explore.';
    notify('courtvision-preview-ready');
  })().catch(fail);
}
