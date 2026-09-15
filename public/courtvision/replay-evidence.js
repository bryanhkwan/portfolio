// Compatibility for hash-pinned broadcasts produced before jump support was
// consistently labeled. This only demotes evidence; it never changes geometry,
// authorizes a layer, fills a gap, or mutates the published response.
export function normalizeReplayPredictionLabels(replay) {
  if (replay?.broadcast_reconstruction !== true || replay.publication_allowed !== true
      || !Array.isArray(replay.players)) return replay;
  let changed = false;
  const players = replay.players.map(player => {
    let playerChanged = false;
    if (!Array.isArray(player.samples)) return player;
    const samples = player.samples.map(sample => {
      const times = sample.ground_support_times_s;
      if (sample.is_predicted === true
          || !["predicted_floor_position_during_jump", "predicted_floor_position_during_foot_occlusion"].includes(sample.ground_contact_status)
          || sample.position_source !== "reviewed_support_shoes_bounded_floor_proxy"
          || !Array.isArray(times) || times.length !== 2
          || !times.every(t => typeof t === "number" && Number.isFinite(t))
          || typeof sample.time_s !== "number" || !Number.isFinite(sample.time_s)
          || !(times[0] < times[1] && times[0] <= sample.time_s && sample.time_s <= times[1])) return sample;
      changed = playerChanged = true;
      return { ...sample, is_predicted: true };
    });
    return playerChanged ? { ...player, samples } : player;
  });
  return changed ? { ...replay, players } : replay;
}
