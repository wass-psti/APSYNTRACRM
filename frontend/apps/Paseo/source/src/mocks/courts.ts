import type { Court } from '../types/domain';

/** Deterministic presentation fixtures: not inventory, live rates, or confirmed availability. */
export const courts: readonly Court[] = [
  { id: 'court-1', name: 'Court 1', description: 'Your court for rallies, quick matches, and social play.', active: true, features: ['Dedicated court', 'Singles & doubles'] },
  { id: 'court-2', name: 'Court 2', description: 'A great spot to bring your group and get a game going.', active: true, features: ['Dedicated court', 'Singles & doubles'] },
  { id: 'court-3', name: 'Court 3', description: 'Make room for another round with friends and family.', active: true, features: ['Dedicated court', 'Singles & doubles'] },
];
