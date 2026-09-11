// Deliberately fictional inputs. This small, transparent exercise is not the production scouting model.
export type Priority = 'balanced' | 'shooting' | 'defense';
export type Candidate = { id: string; label: string; role: string; shooting: number; defense: number; playmaking: number; shots: [number, number, boolean][] };
export const weights: Record<Priority, { shooting: number; defense: number; playmaking: number }> = {
  balanced: { shooting: .4, defense: .35, playmaking: .25 },
  shooting: { shooting: .7, defense: .15, playmaking: .15 },
  defense: { shooting: .15, defense: .7, playmaking: .15 },
};
export const candidates: Candidate[] = [
  { id: 'a', label: 'Sample A', role: 'Floor spacer', shooting: 92, defense: 55, playmaking: 65, shots: [[14,20,true],[12,28,true],[20,45,false],[30,54,true],[45,62,true],[59,59,false],[73,45,true],[87,28,false],[85,20,true],[48,26,true],[37,32,false],[63,35,true],[23,24,false],[72,31,false],[52,48,true],[52,57,false],[32,48,true],[63,58,true]] },
  { id: 'b', label: 'Sample B', role: 'Two-way wing', shooting: 79, defense: 85, playmaking: 74, shots: [[14,18,false],[17,32,true],[27,46,true],[36,57,false],[56,59,true],[72,50,true],[88,20,true],[81,31,false],[48,18,true],[53,23,true],[46,29,true],[53,33,false],[38,37,true],[62,34,true],[34,29,false],[67,45,false],[48,49,true],[60,53,false]] },
  { id: 'c', label: 'Sample C', role: 'Defensive anchor', shooting: 56, defense: 96, playmaking: 57, shots: [[46,18,true],[51,17,true],[54,21,true],[44,24,false],[48,27,true],[55,28,true],[42,33,false],[59,34,true],[49,36,true],[37,28,false],[60,22,true],[54,40,false],[37,46,false],[74,43,false],[26,32,true],[66,53,false],[49,21,true],[57,18,true]] },
  { id: 'd', label: 'Sample D', role: 'Lead creator', shooting: 74, defense: 68, playmaking: 96, shots: [[14,20,false],[27,43,true],[46,56,true],[70,47,false],[87,21,true],[45,18,true],[56,23,false],[41,32,true],[61,36,true],[34,38,false],[54,42,true],[48,33,true],[39,48,false],[63,49,true],[72,28,false],[25,29,true],[50,22,true],[61,29,false]] },
];
export function fitScore(candidate: Candidate, priority: Priority): number {
  const w = weights[priority];
  // Integer percentage weights avoid floating-point half-rounding (84.15 -> 84.1).
  const weighted = candidate.shooting * Math.round(w.shooting * 100) + candidate.defense * Math.round(w.defense * 100) + candidate.playmaking * Math.round(w.playmaking * 100);
  return Math.round(weighted / 10) / 10;
}
export function rankCandidates(priority: Priority) {
  return [...candidates].sort((a, b) => fitScore(b, priority) - fitScore(a, priority) || a.id.localeCompare(b.id));
}
