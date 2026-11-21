import { describe, expect, it } from 'vitest';
import { motionDurations, motionPresets, motionSprings } from './presets';

describe('FE-IMM-01 motion foundation', () => {
  it('keeps timed interaction presets bounded and ordered', () => {
    expect(motionDurations.instant).toBeLessThan(motionDurations.fast);
    expect(motionDurations.fast).toBeLessThan(motionDurations.standard);
    expect(motionDurations.standard).toBeLessThan(motionDurations.gentle);
    expect(motionDurations.gentle).toBeLessThanOrEqual(0.4);
  });

  it('limits movement to subtle compositor-friendly transforms', () => {
    expect(motionPresets.cardHover.y).toBeGreaterThanOrEqual(-6);
    expect(motionPresets.buttonHover.y).toBeGreaterThanOrEqual(-3);
    expect(motionPresets.buttonPress.scale).toBeGreaterThan(0.97);
    expect(motionPresets.revealHidden).toEqual({ opacity: 0, y: 12 });
    expect(motionPresets.revealVisible).toEqual({ opacity: 1, y: 0 });
    expect(motionSprings.interactive.damping).toBeGreaterThan(0);
  });
});
