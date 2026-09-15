import { identityIntervalBlocked } from "./replay-identity-barriers.js";

// Coaching geometry is a read-only view of replay evidence. No identity, team,
// court coordinate, or event truth is inferred or written by these helpers.
const EPSILON = 0.0001;
const MAX_SAMPLE_AGE_S = 0.075;
const MAX_SEGMENT_GAP_S = 0.28;
const MAX_SPEED_FT_S = 40;
const finite = value => typeof value === "number" && Number.isFinite(value);
const sourceCache = new WeakMap();

export function normalizeCoachingOptions(value = {}, previous = {}) {
  const options = { enabled: false, selectedPlayerId: null, showHistory: true,
    showSpacing: false, historySeconds: 5, trustedTeams: {}, ...previous, ...value };
  const teams = {};
  if (options.trustedTeams && typeof options.trustedTeams === "object" && !Array.isArray(options.trustedTeams)) {
    for (const [id, team] of Object.entries(options.trustedTeams)) {
      if (typeof team === "string" && team.trim() && id.length < 160) teams[id] = team.trim().slice(0, 80);
    }
  }
  return { enabled: options.enabled === true, selectedPlayerId: typeof options.selectedPlayerId === "string"
    && options.selectedPlayerId.length < 200 ? options.selectedPlayerId : null,
  showHistory: options.showHistory === true, showSpacing: options.showSpacing === true,
  historySeconds: Math.min(5, Math.max(0.1, finite(options.historySeconds) ? options.historySeconds : 5)), trustedTeams: teams };
}

export function coachingPlayerOptions(players = []) {
  const unique = new Map();
  for (const player of players) {
    const id = player.profile_id || player.marker_id;
    if (!id || unique.has(id)) continue;
    unique.set(id, { id, label: String(player.label || id), profileId: player.profile_id || null });
  }
  return [...unique.values()];
}

function samplesOf(player) {
  const source = player.samples;
  const cached = sourceCache.get(player);
  if (cached?.source === source) return cached.samples;
  // Keep invalid positions in the sequence: discarding them here could join a
  // path across missing evidence. Only timestamps are needed for binary search.
  const samples = Array.isArray(source) ? source.filter(sample => finite(sample?.time_s)).slice()
    .sort((a, b) => a.time_s - b.time_s) : [];
  sourceCache.set(player, { source, samples });
  return samples;
}

function lowerBound(samples, timeS) {
  let low = 0, high = samples.length;
  while (low < high) { const mid = (low + high) >>> 1; if (samples[mid].time_s < timeS) low = mid + 1; else high = mid; }
  return low;
}

function validFloor(sample, court = {}) {
  const width = finite(court.width_ft) ? court.width_ft : 50;
  const length = finite(court.length_ft) ? court.length_ft : 94;
  return finite(sample?.x_ft) && finite(sample?.y_ft) && sample.x_ft >= 0 && sample.x_ft <= width
    && sample.y_ft >= 0 && sample.y_ft <= length;
}

function identitySupported(player, sample) {
  return Boolean(player.profile_id) && sample?.identity_review_abstained !== true
    && !/unknown|unidentified|abstain|conflict|ambiguous|reacquisition|withheld/i.test(String(player.identity_source || ""))
    && !/unknown|unidentified|abstain|conflict|ambiguous|withheld|unsupported/i.test(String(sample?.identity_status || ""));
}

function observedFloor(sample) {
  const source = String(sample.position_source || "");
  const contact = String(sample.ground_contact_status || "");
  return sample.is_predicted === false && sample.is_stale !== true
    && !/predict|interpolat|extrapolat|stale|unsupported|withheld|estimate/i.test(source)
    && !/unsupported|withheld|uncertain|airborne|unresolved|predict|estimate/i.test(contact)
    && (sample.confidence == null || finite(sample.confidence) && sample.confidence >= 0.5)
    && (sample.coordinate_uncertainty_ft == null || finite(sample.coordinate_uncertainty_ft) && sample.coordinate_uncertainty_ft <= 1.5);
}

function usableHistorySample(player, sample, court) {
  return validFloor(sample, court) && identitySupported(player, sample)
    && !identityIntervalBlocked(player, sample.time_s)
    && !/unsupported|stale|extrapolat/i.test(String(sample.position_source || ""));
}

function historyContinuityChanged(left, right) {
  const root = sample => String(sample.source_track_root ?? sample._track_root ?? "").replace(/^T/, "");
  if (root(left) && root(right) && root(left) !== root(right)) return true;
  return ["segment_id", "continuity_id", "camera_id"].some(key => left[key] != null && right[key] != null && left[key] !== right[key]);
}

export function coachingSampleAt(player, timeS, court = {}) {
  if (!player || !finite(timeS)) return { status: "unavailable", reason: "No player observation at this time.", anchor: null };
  if (!player.profile_id) return { status: "unidentified", reason: "Player identity is unresolved; distances are withheld.", anchor: null };
  if (identityIntervalBlocked(player, timeS)) return { status: "ambiguous", reason: "Identity is uncertain in this interval; distances are withheld.", anchor: null };
  const samples = samplesOf(player), index = lowerBound(samples, timeS);
  const candidates = [samples[index - 1], samples[index]].filter(Boolean)
    .sort((a, b) => Math.abs(a.time_s - timeS) - Math.abs(b.time_s - timeS));
  let sample = candidates[0];
  // The replay upsamples observed 15 Hz anchors to 30 Hz. At those explicitly
  // tagged cadence-only frames, quote a nearby *original* observation and its
  // timestamp. This is not permission to measure an occluded or jumping player.
  if (sample?.position_source === "source_cadence_interpolation") {
    const local = samples.slice(Math.max(0, index - 3), index + 3);
    const observed = local.filter(candidate => observedFloor(candidate) && identitySupported(player, candidate)
      && validFloor(candidate, court) && Math.abs(candidate.time_s - timeS) <= MAX_SAMPLE_AGE_S + EPSILON
      && !identityIntervalBlocked(player, candidate.time_s, timeS)
      && local.filter(middle => middle.time_s >= Math.min(candidate.time_s, timeS)
        && middle.time_s <= Math.max(candidate.time_s, timeS))
        .every(middle => observedFloor(middle) || middle.position_source === "source_cadence_interpolation"))
      .sort((a, b) => Math.abs(a.time_s - timeS) - Math.abs(b.time_s - timeS));
    if (observed.length) sample = observed[0];
  }
  if (!sample || Math.abs(sample.time_s - timeS) > MAX_SAMPLE_AGE_S + EPSILON
    || identityIntervalBlocked(player, sample.time_s, timeS)) {
    return { status: "unavailable", reason: "No nearby source observation; distances are withheld.", anchor: null };
  }
  if (!identitySupported(player, sample)) return { status: "ambiguous", reason: "Player identity is uncertain; distances are withheld.", anchor: null };
  if (!validFloor(sample, court)) return { status: "unavailable", reason: "Court position is unavailable or outside the calibrated court.", anchor: null };
  const anchor = { x_ft: sample.x_ft, y_ft: sample.y_ft, time_s: sample.time_s,
    frame_index: sample.frame_index ?? null, position_source: sample.position_source || null };
  if (!observedFloor(sample)) return { status: "estimated", reason: "Position is estimated or has uncertain floor contact; distances are withheld.", anchor };
  return { status: "observed", reason: "Approximate distance from observed floor anchors; court mapping remains an estimate.", anchor };
}

export function coachingHistorySegments(player, timeS, { historySeconds = 5, court = {} } = {}) {
  if (!player || !finite(timeS)) return [];
  const samples = samplesOf(player), start = timeS - Math.min(5, Math.max(0.1, historySeconds));
  const first = Math.max(1, lowerBound(samples, start));
  const segments = [];
  for (let index = first; index < samples.length; index += 1) {
    const left = samples[index - 1], right = samples[index];
    if (right.time_s > timeS + EPSILON) break; // Never preview future motion.
    const gap = right.time_s - left.time_s;
    if (left.time_s < start - EPSILON || gap <= EPSILON || gap > MAX_SEGMENT_GAP_S
      || !usableHistorySample(player, left, court) || !usableHistorySample(player, right, court)
      || historyContinuityChanged(left, right)
      || identityIntervalBlocked(player, left.time_s, right.time_s)) continue;
    if (Math.hypot(right.x_ft - left.x_ft, right.y_ft - left.y_ft) / gap > MAX_SPEED_FT_S) continue;
    const kind = observedFloor(left) && observedFloor(right) ? "observed" : "estimated";
    segments.push({ start: { x_ft: left.x_ft, y_ft: left.y_ft, time_s: left.time_s },
      end: { x_ft: right.x_ft, y_ft: right.y_ft, time_s: right.time_s }, kind });
  }
  return segments;
}

export function buildCoachingState(replay, timeS, inputOptions = {}, visibleMarkerIds = null) {
  const options = normalizeCoachingOptions({ trustedTeams: replay?.coaching?.trusted_teams || {}, ...inputOptions }), players = replay?.players || [];
  const matching = players.filter(player => (player.profile_id || player.marker_id) === options.selectedPlayerId
    || player.marker_id === options.selectedPlayerId);
  const court = replay?.court || {};
  const candidates = matching.map(player => ({ player, sample: coachingSampleAt(player, timeS, court) }));
  const usable = candidates.filter(candidate => candidate.sample.anchor
    && (visibleMarkerIds === null || visibleMarkerIds.has(candidate.player.marker_id)));
  const selected = usable[0] || candidates[0];
  const selectedPlayer = selected?.player;
  let selection = selected?.sample || { status: "unavailable", reason: "Select a player to inspect movement and spacing.", anchor: null };
  if (usable.length > 1) selection = { status: "ambiguous", reason: "Multiple bodies share this identity; distances are withheld.", anchor: null };
  if (selectedPlayer && visibleMarkerIds !== null && !visibleMarkerIds.has(selectedPlayer.marker_id))
    selection = { status: "unavailable", reason: "This player is not supported in the current replay frame.", anchor: null };
  const team = selectedPlayer?.profile_id ? options.trustedTeams[selectedPlayer.profile_id] : null;
  const teamMetadataAvailable = Boolean(team);
  const peers = [], seenProfiles = new Map();
  for (const player of players) {
    if (!player.profile_id || matching.includes(player) || visibleMarkerIds !== null && !visibleMarkerIds.has(player.marker_id)) continue;
    const sample = coachingSampleAt(player, timeS, court);
    if (sample.anchor) seenProfiles.set(player.profile_id, (seenProfiles.get(player.profile_id) || 0) + 1);
    if (sample.status !== "observed" || selection.anchor
      && Math.abs(sample.anchor.time_s - selection.anchor.time_s) > MAX_SAMPLE_AGE_S + EPSILON) continue;
    peers.push({ player, sample });
  }
  const connections = [];
  if (selection.status === "observed") {
    const valid = peers.filter(({ player }) => seenProfiles.get(player.profile_id) === 1)
      .map(({ player, sample }) => ({ playerId: player.profile_id, markerId: player.marker_id, label: player.label || player.profile_id,
        kind: !teamMetadataAvailable ? "player" : options.trustedTeams[player.profile_id] === team ? "teammate"
          : options.trustedTeams[player.profile_id] ? "opponent" : "unknown",
        distanceFt: Math.hypot(sample.anchor.x_ft - selection.anchor.x_ft, sample.anchor.y_ft - selection.anchor.y_ft),
        start: selection.anchor, end: sample.anchor })).sort((a, b) => a.distanceFt - b.distanceFt || a.markerId.localeCompare(b.markerId));
    if (teamMetadataAvailable) {
      connections.push(...valid.filter(item => item.kind === "teammate"));
      const opponent = valid.find(item => item.kind === "opponent"); if (opponent) connections.push(opponent);
    } else if (valid.length) connections.push(valid[0]);
  }
  const nearest = connections.find(item => item.kind === (teamMetadataAvailable ? "opponent" : "player")) || null;
  const historyPlayers = Array.isArray(replay?.coaching?.history_players) ? replay.coaching.history_players : players;
  const selectedHistory = selectedPlayer ? historyPlayers.filter(player => selectedPlayer.profile_id
    ? player.profile_id === selectedPlayer.profile_id : player.marker_id === selectedPlayer.marker_id) : [];
  const trailSegments = usable.length > 1 ? [] : selectedHistory.flatMap(player => coachingHistorySegments(player, timeS, {
    historySeconds: options.historySeconds, court })).sort((a, b) => a.start.time_s - b.start.time_s);
  const windowStartS = finite(timeS) ? timeS - options.historySeconds : null;
  const anchorPoints = usable.length > 1 ? [] : selectedHistory.flatMap(player => {
    const samples = samplesOf(player), anchors = [];
    for (let index = lowerBound(samples, windowStartS); index < samples.length; index += 1) {
      const sample = samples[index];
      if (sample.time_s > timeS + EPSILON) break;
      if (usableHistorySample(player, sample, court) && observedFloor(sample)) anchors.push({
        x_ft: sample.x_ft, y_ft: sample.y_ft, time_s: sample.time_s, frame_index: sample.frame_index ?? null });
    }
    return anchors;
  }).sort((a, b) => a.time_s - b.time_s);
  const observedSegments = trailSegments.filter(segment => segment.kind === "observed").length;
  const estimatedSegments = trailSegments.length - observedSegments;
  const starts = [trailSegments[0]?.start.time_s, anchorPoints[0]?.time_s].filter(finite);
  const availableStartS = starts.length ? Math.min(...starts) : null;
  return { ...options, timeS: finite(timeS) ? timeS : null, selectedMarkerId: selectedPlayer?.marker_id || null,
    players: coachingPlayerOptions(players), selection, teamMetadataAvailable, nearest, connections,
    measurementStatus: selection.status !== "observed" ? "withheld" : connections.length ? "available" : "withheld",
    measurementReason: selection.status !== "observed" ? selection.reason : connections.length
      ? teamMetadataAvailable ? "Reviewed team geometry; opponent proximity does not establish a defensive assignment."
        : "Teams are not reviewed. Showing the nearest identified player, not a defender."
      : teamMetadataAvailable ? "No other supported player with reviewed team metadata at this time."
        : "No other identified player has a supported floor anchor at this time.",
    trails: { windowStartS, availableStartS, availableSeconds: availableStartS === null ? 0 : Math.min(options.historySeconds, timeS - availableStartS),
      observedSegments, estimatedSegments, observedAnchors: anchorPoints.length, anchorPoints, segments: trailSegments } };
}
