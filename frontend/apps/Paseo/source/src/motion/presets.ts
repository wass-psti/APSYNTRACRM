/**
 * FE-IMM-01: reusable animation timings and spring dynamics.
 * Durations are seconds because Motion's JS API uses seconds.
 * Own only transforms and opacity; never animate authoritative booking state.
 */
export const motionDurations = {
  instant: 0.1,
  fast: 0.16,
  standard: 0.26,
  gentle: 0.38,
} as const;

export const motionSprings = {
  interactive: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
  gentle: { type: 'spring', stiffness: 230, damping: 27, mass: 1 },
} as const;

export const motionPresets = {
  cardHover: { y: -4 },
  buttonHover: { y: -2 },
  buttonPress: { scale: 0.985 },
  revealHidden: { opacity: 0, y: 12 },
  revealVisible: { opacity: 1, y: 0 },
} as const;
