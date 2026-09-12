/** These locations are portfolio wayfinding metaphors, not a surveyed floor plan. */
export const arenaChapters = [
  { id: 'projects', number: '01', title: 'Projects', location: 'Center court', headline: 'A different angle on the game.', anchor: [0, .3, 0], fallback: 'work/' },
  { id: 'experience', number: '02', title: 'Experience', location: 'Jumbotron', headline: 'University of Toledo Athletics', anchor: [0, 11.85, 3.31], fallback: 'about/#experience' },
  { id: 'research', number: '03', title: 'Research', location: 'Film room', headline: 'Talent is global. Opportunity is local.', anchor: [0, 8, -28], fallback: 'research/' },
  { id: 'about', number: '04', title: 'About', location: 'Concourse', headline: 'Rooted in Toledo. Always curious.', anchor: [-39, 8, 8], fallback: 'about/' },
  { id: 'contact', number: '05', title: 'Contact', location: 'Atrium', headline: 'Let’s build the next chapter.', anchor: [38, 6, 19], fallback: 'about/#contact' },
] as const;

export type ChapterId = typeof arenaChapters[number]['id'];
export type ArenaDestination = 'exterior' | 'overview' | ChapterId;
export type JourneyPhase = 'exterior' | 'entering' | 'overview' | 'travelling' | 'section' | 'returning';
export interface JourneyState { destination: ArenaDestination; phase: JourneyPhase; }
export function destinationFromHash(hash: string): ArenaDestination | null {
  if (hash === '#arena-overview') return 'overview';
  if (hash === '#arena-home') return 'exterior';
  return arenaChapters.find(chapter => hash === `#arena-${chapter.id}`)?.id ?? null;
}
export const destinationHash = (destination: ArenaDestination) => `#arena-${destination === 'exterior' ? 'home' : destination}`;
