import assert from 'node:assert/strict';
import test from 'node:test';
import { candidates, fitScore, rankCandidates, weights } from '../src/data/scouting.ts';
test('priority changes produce the expected, explainable shortlist', () => {
  assert.deepEqual(rankCandidates('balanced').map(p => p.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(rankCandidates('shooting').map(p => p.id), ['a', 'b', 'd', 'c']);
  assert.deepEqual(rankCandidates('defense').map(p => p.id), ['c', 'b', 'd', 'a']);
  assert.equal(fitScore(candidates[0], 'shooting'), 82.4);
  assert.equal(fitScore(candidates[2], 'defense'), 84.2);
});
test('ratings and weights retain their documented bounds without mutating source order', () => {
  for (const weight of Object.values(weights)) assert.ok(Math.abs(weight.shooting + weight.defense + weight.playmaking - 1) < .0001);
  for (const candidate of candidates) for (const rating of [candidate.shooting,candidate.defense,candidate.playmaking]) assert.ok(rating >= 0 && rating <= 100);
  rankCandidates('defense');
  assert.deepEqual(candidates.map(p => p.id), ['a','b','c','d']);
});
